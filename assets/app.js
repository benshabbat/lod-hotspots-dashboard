// Initialize Leaflet Map
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([31.954, 34.890], 13.5);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Close drawer on map click
    map.on('click', function() {
      closeDrawer();
      clearActiveRow();
    });

    // Satellite Imagery Layer
    var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    }).addTo(map);

    // Labels layer
    var labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      opacity: 0.85
    }).addTo(map);

    // Municipal Boundary Polygon of Lod
    // lodPolygonCoords is loaded from data.js.
    var lodBoundary = L.polygon(lodPolygonCoords, {
      color: '#0084ff',
      weight: 3.5,
      opacity: 0.95,
      fillColor: '#0084ff',
      fillOpacity: 0.04
    }).addTo(map);

    function fitLodBounds() {
      map.fitBounds(lodBoundary.getBounds(), { padding: [25, 25] });
    }
    fitLodBounds();

    // Events dataset
    // eventsData is loaded from data.js.
    var markerInstances = {};
    var currentFilter = 'all';
    var currentSearch = '';
    var activeEventId = null;

    // Render Markers
    eventsData.forEach(function(ev) {
      var dayTagClass = ev.day_code === 'sunday' ? 'tag-sun' : 'tag-mon';
      var dayLabel = ev.day_badge;

      var iconHtml = `
        <div class="custom-incident-pin" id="pin-ev-${ev.id}">
          <div class="pin-radar-ring"></div>
          <div class="pin-badge-container" style="border-color: ${ev.badge_color};">
            <div class="pin-icon-circle" style="background: ${ev.badge_color};">${ev.icon}</div>
            <div class="pin-texts">
              <div class="pin-title-row">
                <span class="pin-day-badge ${dayTagClass}">${dayLabel}</span>
                <span class="pin-title-text">${ev.street}</span>
              </div>
              <div class="pin-event-text">${ev.event}</div>
            </div>
          </div>
        </div>
      `;

      var isMobile = window.innerWidth <= 600;
      var customIcon = L.divIcon({
        html: iconHtml,
        className: 'leaflet-incident-div-icon',
        iconSize: isMobile ? [36, 36] : [185, 44],
        iconAnchor: isMobile ? [18, 18] : [92, 22],
        popupAnchor: [0, -22]
      });

      var popupHtml = `
        <div class="popup-header">
          <span style="font-weight:900; font-size:12.5px;">${ev.day} | ${ev.category_title}</span>
          <span style="font-size:16px;">${ev.icon}</span>
        </div>
        <div class="popup-body">
          <div class="popup-title">${ev.street}</div>
          <div class="popup-loc">📍 ${ev.area}</div>
          <div class="popup-desc">
            <strong>פירוט האירוע:</strong> ${ev.notes}<br>
            <strong>סטטוס טיפול:</strong> ${ev.action}
          </div>
          <div class="popup-actions">
            <a href="${ev.gmaps_url}" target="_blank" class="popup-btn">
              📍 ניווט ב-Google Maps
            </a>
            <a href="${ev.waze_url}" target="_blank" class="popup-btn waze">
              🚗 ניווט ב-Waze
            </a>
          </div>
        </div>
      `;

      var marker = L.marker([ev.lat, ev.lng], { icon: customIcon }).addTo(map);

      // On Marker Click -> Select event with two-way active highlighting!
      marker.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        selectEvent(ev.id, 'map');
      });

      marker.bindPopup(popupHtml);
      markerInstances[ev.id] = marker;
    });

    function eventCountLabel(count) {
      return count === 1 ? 'אירוע אחד' : count + ' אירועים';
    }

    // Build Categorized Tables in Sidebar
    function buildSidebarTables() {
      var container = document.getElementById('tablesContainer');
      container.innerHTML = '';

      // Group events by category
      var categoriesMap = {};
      eventsData.forEach(function(ev) {
        if (!categoriesMap[ev.category]) {
          categoriesMap[ev.category] = {
            key: ev.category,
            title: ev.category_title,
            icon: ev.category_icon || ev.icon,
            items: []
          };
        }
        categoriesMap[ev.category].items.push(ev);
      });

      Object.values(categoriesMap).forEach(function(catGroup) {
        var box = document.createElement('div');
        box.className = 'report-table-box';
        box.id = 'cat-box-' + catGroup.key;
        box.setAttribute('data-cat', catGroup.key);

        var categoryColor = catGroup.items[0].badge_color;
        var categoryBg = catGroup.items[0].badge_bg;
        box.style.setProperty('--cat-color', categoryColor);
        box.style.setProperty('--cat-bg', categoryBg);

        var rowsHtml = catGroup.items.map(function(ev, idx) {
          var dayTagClass = ev.day_code === 'sunday' ? 'tag-sun' : 'tag-mon';
          return `
            <article class="event-card" id="row-ev-${ev.id}" data-id="${ev.id}" data-day="${ev.day_code}" data-cat="${ev.category}"
              style="--accent:${ev.badge_color}; --accent-bg:${ev.badge_bg};" tabindex="0" role="button"
              aria-label="${ev.event}, ${ev.street}" onclick="selectEvent(${ev.id}, 'table')"
              onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); selectEvent(${ev.id}, 'table'); }">
              <div class="event-card-head">
                <div class="event-icon" aria-hidden="true">${ev.icon}</div>
                <div class="event-card-copy">
                  <div class="event-card-title-row">
                    <div class="event-name">${ev.event}</div>
                    <span class="day-tag ${dayTagClass}">${ev.day_badge}</span>
                  </div>
                  <div class="event-location">📍 ${ev.street} · ${ev.area}</div>
                </div>
              </div>
              <div class="event-notes">${ev.notes}</div>
              <div class="event-status"><span aria-hidden="true">✓</span><span class="status-label">טיפול:</span><span>${ev.action}</span></div>
              <div class="event-card-footer">
                <span class="event-number">אירוע #${ev.id}</span>
                <div class="action-links">
                  <a href="${ev.gmaps_url}" target="_blank" class="act-link" onclick="event.stopPropagation();">📍 Google Maps</a>
                  <a href="${ev.waze_url}" target="_blank" class="act-link" onclick="event.stopPropagation();">🚗 Waze</a>
                </div>
              </div>
            </article>
          `;
        }).join('');

        box.innerHTML = `
          <div class="table-cat-title">
            <span class="cat-title-label"><span class="cat-title-icon">${catGroup.icon}</span>${catGroup.title}</span>
            <span class="cat-badge" id="cat-badge-${catGroup.key}">${eventCountLabel(catGroup.items.length)}</span>
          </div>
          <div class="event-cards">${rowsHtml}</div>
        `;
        container.appendChild(box);
      });

      var emptyState = document.createElement('div');
      emptyState.className = 'no-results';
      emptyState.id = 'noResults';
      emptyState.innerHTML = '<span class="no-results-icon">🔎</span><strong>לא נמצאו אירועים</strong><br>נסו לשנות את החיפוש או לבחור מסנן אחר';
      container.appendChild(emptyState);
    }

    buildSidebarTables();

    // Two-Way Interactive Event Selection (Row click <-> Marker click)
    function selectEvent(id, source) {
      activeEventId = id;
      var ev = eventsData.find(e => e.id === id);
      var m = markerInstances[id];
      if (!ev || !m) return;

      // 1. Highlight Row in Table
      document.querySelectorAll('.event-card').forEach(function(r) {
        r.classList.remove('active-row');
      });
      var targetRow = document.getElementById('row-ev-' + id);
      if (targetRow) {
        targetRow.classList.add('active-row');
        // If triggered from map click, scroll table smoothly to row
        if (source === 'map') {
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // 2. Highlight Pin on Map
      document.querySelectorAll('.leaflet-incident-div-icon').forEach(function(p) {
        p.classList.remove('selected-pin');
      });
      var pinElem = m.getElement();
      if (pinElem) {
        pinElem.classList.add('selected-pin');
      }

      // 3. Focus Map
      map.setView(m.getLatLng(), 16, { animate: true });

      // 4. Open Popup or Mobile Drawer
      if (window.innerWidth <= 992) {
        openMobileDrawer(ev);
        if (source === 'table') {
          switchTab('map');
        }
      } else {
        m.openPopup();
      }
    }

    function clearActiveRow() {
      activeEventId = null;
      document.querySelectorAll('.event-card').forEach(function(r) {
        r.classList.remove('active-row');
      });
      document.querySelectorAll('.leaflet-incident-div-icon').forEach(function(p) {
        p.classList.remove('selected-pin');
      });
    }

    function openMobileDrawer(ev) {
      var drawer = document.getElementById('mobileDrawer');
      document.getElementById('drawerTitle').innerHTML = `${ev.icon} ${ev.street} (${ev.event})`;
      document.getElementById('drawerLoc').innerText = `📍 ${ev.day} | ${ev.area}`;
      document.getElementById('drawerDesc').innerHTML = `<strong>פעילות:</strong> ${ev.notes}<br><strong>טיפול:</strong> ${ev.action}`;
      document.getElementById('drawerGmapsBtn').href = ev.gmaps_url;
      document.getElementById('drawerWazeBtn').href = ev.waze_url;
      drawer.style.display = 'block';
    }

    function closeDrawer() {
      document.getElementById('mobileDrawer').style.display = 'none';
    }

    // Filter Chips: updates BOTH Map and Sidebar with active highlight!
    function applyFilter(btn, filterKey) {
      currentFilter = filterKey;

      // Update chip active classes
      document.querySelectorAll('.chip').forEach(function(b) {
        b.classList.remove('active');
      });
      if (btn) {
        btn.classList.add('active');
      } else {
        var match = document.querySelector(`.chip[data-filter="${filterKey}"]`);
        if (match) match.classList.add('active');
      }

      updateVisibility();
    }

    // Search input: updates BOTH Map and Sidebar in real-time
    function handleSearch(query) {
      currentSearch = query.trim().toLowerCase();
      var clearBtn = document.getElementById('searchClear');
      if (clearBtn) {
        clearBtn.style.display = currentSearch ? 'flex' : 'none';
      }
      updateVisibility();
    }

    function clearSearch() {
      var input = document.getElementById('searchInput');
      if (input) input.value = '';
      handleSearch('');
    }

    // Core Visibility & Synchronization Engine
    function updateVisibility() {
      var visibleMarkers = [];
      var visibleCount = 0;

      eventsData.forEach(function(ev) {
        var m = markerInstances[ev.id];
        var matchFilter = false;

        if (currentFilter === 'all') {
          matchFilter = true;
        } else if (currentFilter.startsWith('day:')) {
          var d = currentFilter.split(':')[1];
          matchFilter = (ev.day_code === d);
        } else if (currentFilter.startsWith('cat:')) {
          var c = currentFilter.split(':')[1];
          matchFilter = (ev.category === c);
        }

        var matchSearch = true;
        if (currentSearch) {
          var haystack = (ev.street + " " + ev.area + " " + ev.event + " " + ev.notes + " " + ev.day).toLowerCase();
          matchSearch = haystack.includes(currentSearch);
        }

        var show = matchFilter && matchSearch;

        // 1. Update Map Marker
        if (show) {
          if (!map.hasLayer(m)) map.addLayer(m);
          visibleMarkers.push(m);
          visibleCount++;
        } else {
          if (map.hasLayer(m)) map.removeLayer(m);
        }

        // 2. Update Table Row
        var row = document.getElementById('row-ev-' + ev.id);
        if (row) {
          row.style.display = show ? '' : 'none';
        }
      });

      // 3. Update Category Boxes in Sidebar
      document.querySelectorAll('.report-table-box').forEach(function(box) {
        var rows = box.querySelectorAll('.event-card');
        var visRows = Array.from(rows).filter(r => r.style.display !== 'none');
        box.style.display = visRows.length > 0 ? '' : 'none';
        var catKey = box.getAttribute('data-cat');
        var badge = document.getElementById('cat-badge-' + catKey);
        if (badge) {
          badge.innerText = eventCountLabel(visRows.length);
        }
      });

      // 4. Update Counter Header
      var counter = document.getElementById('visibleCounter');
      if (counter) {
        counter.innerText = `מציג ${visibleCount} מתוך ${eventsData.length}`;
      }

      var noResults = document.getElementById('noResults');
      if (noResults) {
        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
      }

      // 5. Smart Map Framing
      if (visibleMarkers.length > 0 && currentFilter !== 'all') {
        var group = L.featureGroup(visibleMarkers);
        map.fitBounds(group.getBounds(), { padding: [60, 60], maxZoom: 15 });
      } else if (currentFilter === 'all' && !currentSearch) {
        fitLodBounds();
      }
    }

    // Mobile Tab Bar Switcher
    function switchTab(tab) {
      var mapEl = document.getElementById('mapViewTab');
      var sideEl = document.getElementById('sidebarViewTab');
      var btnMap = document.getElementById('tabBtnMap');
      var btnList = document.getElementById('tabBtnList');
      var btnLegend = document.getElementById('tabBtnLegend');

      btnMap.classList.remove('active');
      btnList.classList.remove('active');
      btnLegend.classList.remove('active');

      if (tab === 'map') {
        mapEl.style.display = 'block';
        sideEl.style.display = 'none';
        btnMap.classList.add('active');
        setTimeout(function() { map.invalidateSize(); }, 100);
      } else if (tab === 'list') {
        mapEl.style.display = 'none';
        sideEl.style.display = 'flex';
        btnList.classList.add('active');
        closeDrawer();
      } else if (tab === 'legend') {
        mapEl.style.display = 'block';
        sideEl.style.display = 'none';
        btnLegend.classList.add('active');
        var leg = document.getElementById('desktopLegend');
        leg.style.display = leg.style.display === 'block' ? 'none' : 'block';
        setTimeout(function() { map.invalidateSize(); }, 100);
      }
    }

    function shareSummaryWhatsApp() {
      var text = `📢 *סיכום נקודות חמות - עיריית לוד | מבצע יום הכיפורים* (ראשון ושני):\n` +
        `*ערב יום כיפור (יום א'):*\n` +
        `• שד' מיכה רייסר: פתיחת דוכן מזון פיראטי\n` +
        `• רח' מאיר הר ציון: גניבת מצלמת מוקד רואה + נסיעות אופנועים\n\n` +
        `*מהלך וצאת יום כיפור (יום ב'):*\n` +
        `• שכונת נאות יצחק: מיניבוס חסימה יצא לפני צאת כיפור (17:00)\n` +
        `• פארק גני אביב: חשד לגניבת מצלמת עירייה\n` +
        `• רח' עשרת הרוגי מלכות: סוס משוטט\n` +
        `• רח' איילון 11: שריפת ספה במרחב הציבורי\n` +
        `• רח' אריה רובין: רעש וצעקות נערות\n` +
        `• שד' דוד המלך + שלמה המלך: התקהלויות נוער והקמת רעש\n\n` +
        `לצפייה במפה האינטראקטיבית ובניווט ישיר ב-Google Maps וב-Waze: ${window.location.href}`;
      var url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
      window.open(url, '_blank');
    }
