// Map setup
var map = L.map('map', {
  zoomControl: false,
  attributionControl: false
}).setView([31.954, 34.890], 13.5);

L.control.zoom({ position: 'bottomright' }).addTo(map);

map.on('click', function() {
  closeDrawer();
  clearActiveRow();
});

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19
}).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{r}.png', {
  subdomains: 'abcd',
  maxZoom: 19,
  opacity: 0.85
}).addTo(map);

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

var currentYear = '2026';
var currentYearConfig = dashboardYears[currentYear];
var eventsData = currentYearConfig.events;
var markerInstances = {};
var districtMarkerInstances = {};
var currentFilter = 'all';
var currentSearch = '';
var activeEventId = null;

function dayTagClass(eventItem) {
  if (eventItem.day_code === 'sunday') return 'tag-sun';
  if (eventItem.day_code === 'monday') return 'tag-mon';
  return 'tag-year';
}

function eventCountLabel(count) {
  if (count === 1) return currentYear === '2026' ? 'אירוע אחד' : 'מוקד אחד';
  return count + ' ' + currentYearConfig.itemNoun;
}

function uniqueCategoryGroups() {
  var categories = {};
  eventsData.forEach(function(eventItem) {
    if (!categories[eventItem.category]) {
      categories[eventItem.category] = {
        key: eventItem.category,
        title: eventItem.category_title,
        icon: eventItem.category_icon || eventItem.icon,
        color: eventItem.badge_color,
        background: eventItem.badge_bg,
        items: []
      };
    }
    categories[eventItem.category].items.push(eventItem);
  });
  return Object.values(categories);
}

function renderMarkers() {
  Object.values(markerInstances).forEach(function(marker) {
    marker.remove();
  });
  Object.values(districtMarkerInstances).forEach(function(marker) {
    marker.remove();
  });
  markerInstances = {};
  districtMarkerInstances = {};

  eventsData.forEach(function(eventItem) {
    var tagClass = dayTagClass(eventItem);
    var iconHtml = `
      <div class="custom-incident-pin" id="pin-ev-${eventItem.id}">
        <div class="pin-radar-ring"></div>
        <div class="pin-badge-container" style="border-color:${eventItem.badge_color};">
          <div class="pin-icon-circle" style="background:${eventItem.badge_color};">${eventItem.icon}</div>
          <div class="pin-texts">
            <div class="pin-title-row">
              <span class="pin-day-badge ${tagClass}">${eventItem.day_badge}</span>
              <span class="pin-title-text">${eventItem.street}</span>
            </div>
            <div class="pin-event-text">${eventItem.event}${eventItem.case_count > 1 ? ` · ${eventItem.case_count} מקרים` : ''}</div>
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
        <span style="font-weight:900; font-size:12.5px;">${eventItem.day} | ${eventItem.category_title}</span>
        <span style="font-size:16px;">${eventItem.icon}</span>
      </div>
      <div class="popup-body">
        <div class="popup-title">${eventItem.street}</div>
        <div class="popup-loc">📍 ${eventItem.area}</div>
        <div class="popup-desc"><strong>פירוט:</strong> ${eventItem.notes}<br><strong>סטטוס:</strong> ${eventItem.action}</div>
        <div class="popup-actions">
          <a href="${eventItem.gmaps_url}" target="_blank" class="popup-btn">📍 ניווט ב-Google Maps</a>
          <a href="${eventItem.waze_url}" target="_blank" class="popup-btn waze">🚗 ניווט ב-Waze</a>
        </div>
      </div>
    `;

    var marker = L.marker([eventItem.lat, eventItem.lng], { icon: customIcon }).addTo(map);
    marker.on('click', function(clickEvent) {
      L.DomEvent.stopPropagation(clickEvent);
      selectEvent(eventItem.id, 'map');
    });
    marker.bindPopup(popupHtml);
    markerInstances[eventItem.id] = marker;
  });

  renderDistrictMarkers();
}

function renderDistrictMarkers() {
  var reports = currentYearConfig.districtReports || [];

  reports.forEach(function(report) {
    var iconHtml = `
      <div class="custom-incident-pin district-map-pin" id="pin-${report.id}">
        <div class="pin-radar-ring"></div>
        <div class="pin-badge-container">
          <div class="pin-icon-circle">👥</div>
          <div class="pin-texts">
            <div class="pin-title-row">
              <span class="pin-day-badge district-pin-badge">מנהל רובע</span>
              <span class="pin-title-text">${report.neighborhood}</span>
            </div>
            <div class="pin-event-text">${report.manager} · ${report.title}</div>
          </div>
        </div>
      </div>
    `;

    var isMobile = window.innerWidth <= 600;
    var customIcon = L.divIcon({
      html: iconHtml,
      className: 'leaflet-incident-div-icon district-marker-icon',
      iconSize: isMobile ? [36, 36] : [195, 44],
      iconAnchor: isMobile ? [18, 18] : [97, 22],
      popupAnchor: [0, -22]
    });

    var mapsUrl = `https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`;
    var wazeUrl = `https://waze.com/ul?ll=${report.lat},${report.lng}&navigate=yes`;
    var popupHtml = `
      <div class="popup-header district-popup-header">
        <span style="font-weight:900; font-size:12.5px;">👥 דיווח מנהל רובע</span>
        <span style="font-size:12px;">${report.manager}</span>
      </div>
      <div class="popup-body">
        <div class="popup-title">${report.title}</div>
        <div class="popup-loc">📍 ${report.location}</div>
        <div class="popup-desc"><strong>דיווח:</strong> ${report.details}<br><strong>מענה:</strong> ${report.response}</div>
        <div class="popup-actions">
          <a href="${mapsUrl}" target="_blank" class="popup-btn">📍 Google Maps</a>
          <a href="${wazeUrl}" target="_blank" class="popup-btn waze">🚗 Waze</a>
        </div>
      </div>
    `;

    var marker = L.marker([report.lat, report.lng], { icon: customIcon }).addTo(map);
    marker.on('click', function(clickEvent) {
      L.DomEvent.stopPropagation(clickEvent);
      selectDistrictReport(report.id, 'map');
    });
    marker.bindPopup(popupHtml);
    districtMarkerInstances[report.id] = marker;
  });
}

function renderFilterChips() {
  var container = document.getElementById('filterChips');
  var districtReports = currentYearConfig.districtReports || [];
  var chips = [{ key: 'all', label: `הכל (${eventsData.length + districtReports.length})`, day: false }];

  if (districtReports.length) {
    chips.push({
      key: 'district:reports',
      label: `👥 מנהלי רובע (${districtReports.length})`,
      day: false,
      district: true
    });
  }

  if (currentYearConfig.showDayFilters) {
    var days = {};
    eventsData.forEach(function(eventItem) {
      if (!days[eventItem.day_code]) days[eventItem.day_code] = { label: eventItem.day, count: 0 };
      days[eventItem.day_code].count += 1;
    });
    Object.keys(days).forEach(function(dayCode) {
      chips.push({ key: 'day:' + dayCode, label: `${days[dayCode].label} (${days[dayCode].count})`, day: true });
    });
  }

  uniqueCategoryGroups().forEach(function(category) {
    chips.push({
      key: 'cat:' + category.key,
      label: `${category.icon} ${category.title} (${category.items.length})`,
      day: false
    });
  });

  container.innerHTML = chips.map(function(chip) {
    return `<button class="chip${chip.key === 'all' ? ' active' : ''}${chip.day ? ' day-chip' : ''}${chip.district ? ' district-chip' : ''}"
      data-filter="${chip.key}" onclick="applyFilter(this, '${chip.key}')">${chip.label}</button>`;
  }).join('');

  positionDesktopLegend();
}

function positionDesktopLegend() {
  if (window.innerWidth <= 992) return;

  requestAnimationFrame(function() {
    var mapView = document.getElementById('mapViewTab');
    var chips = document.getElementById('filterChips');
    var legend = document.getElementById('desktopLegend');
    if (!mapView || !chips || !legend) return;

    var desiredTop = chips.offsetTop + chips.offsetHeight + 10;
    var maximumTop = Math.max(10, mapView.clientHeight - legend.offsetHeight - 12);
    legend.style.top = Math.min(desiredTop, maximumTop) + 'px';
  });
}

function renderLegend() {
  document.getElementById('legendTitle').innerText = 'מקרא סמלים - ' + currentYear;
  var legendHtml = uniqueCategoryGroups().map(function(category) {
    return `<div class="legend-line"><span>${category.title}</span>
      <div class="legend-icon" style="background:${category.background}; color:${category.color}; border:1px solid ${category.color};">${category.icon}</div></div>`;
  }).join('');

  if ((currentYearConfig.districtReports || []).length) {
    legendHtml += `<div class="legend-line district-legend-line"><span>דיווח מנהל רובע</span>
      <div class="legend-icon" style="background:#faf5ff; color:#7e22ce; border:1px solid #7e22ce;">👥</div></div>`;
  }

  document.getElementById('legendItems').innerHTML = legendHtml;
  positionDesktopLegend();
}

function renderDistrictReports(container) {
  var reports = currentYearConfig.districtReports || [];
  if (!reports.length) return;

  var section = document.createElement('section');
  section.className = 'district-reports-section';
  section.id = 'districtReportsSection';

  var cards = reports.map(function(report) {
    var searchableText = [report.manager, report.role, report.neighborhood, report.title, report.details, report.response]
      .join(' ')
      .toLowerCase();
    return `
      <article class="district-report-card severity-${report.severity}" id="report-card-${report.id}"
        data-search="${searchableText}" tabindex="0" role="button"
        onclick="selectDistrictReport('${report.id}', 'table')"
        onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); selectDistrictReport('${report.id}', 'table'); }">
        <div class="district-report-head">
          <div class="district-manager-icon" aria-hidden="true">🧭</div>
          <div class="district-manager-copy">
            <strong>${report.manager}</strong>
            <span>${report.role}</span>
          </div>
          <span class="district-neighborhood">${report.neighborhood}</span>
        </div>
        <h4>${report.title}</h4>
        <p>${report.details}</p>
        <div class="district-response"><span aria-hidden="true">⚠️</span><strong>מענה:</strong> ${report.response}</div>
      </article>
    `;
  }).join('');

  section.innerHTML = `
    <div class="district-reports-title">
      <span><span class="district-title-icon">👥</span> דיווחי מנהלי רובע</span>
      <span class="district-count">${reports.length} דיווחים</span>
    </div>
    <div class="district-report-cards">${cards}</div>
  `;
  container.appendChild(section);
}

function buildSidebarTables() {
  var container = document.getElementById('tablesContainer');
  container.innerHTML = '';

  renderDistrictReports(container);

  uniqueCategoryGroups().forEach(function(category) {
    var box = document.createElement('section');
    box.className = 'report-table-box';
    box.id = 'cat-box-' + category.key;
    box.setAttribute('data-cat', category.key);
    box.style.setProperty('--cat-color', category.color);
    box.style.setProperty('--cat-bg', category.background);

    var cards = category.items.map(function(eventItem) {
      var occurrenceBadge = eventItem.case_count > 1
        ? `<span class="occurrence-badge">${eventItem.case_count} מקרים</span>`
        : '';
      return `
        <article class="event-card" id="row-ev-${eventItem.id}" data-id="${eventItem.id}"
          data-day="${eventItem.day_code}" data-cat="${eventItem.category}"
          style="--accent:${eventItem.badge_color}; --accent-bg:${eventItem.badge_bg};" tabindex="0" role="button"
          aria-label="${eventItem.event}, ${eventItem.street}" onclick="selectEvent(${eventItem.id}, 'table')"
          onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); selectEvent(${eventItem.id}, 'table'); }">
          <div class="event-card-head">
            <div class="event-icon" aria-hidden="true">${eventItem.icon}</div>
            <div class="event-card-copy">
              <div class="event-card-title-row">
                <div class="event-name">${eventItem.event}</div>
                <span class="day-tag ${dayTagClass(eventItem)}">${eventItem.day_badge}</span>
              </div>
              <div class="event-location">📍 ${eventItem.street} · ${eventItem.area}</div>
            </div>
          </div>
          <div class="event-notes">${eventItem.notes}</div>
          <div class="event-status"><span aria-hidden="true">✓</span><span class="status-label">${currentYear === '2026' ? 'טיפול:' : 'סטטוס:'}</span><span>${eventItem.action}</span></div>
          <div class="event-card-footer">
            <span class="event-number">${currentYear === '2026' ? 'אירוע' : 'מוקד'} #${eventItem.id}</span>${occurrenceBadge}
            <div class="action-links">
              <a href="${eventItem.gmaps_url}" target="_blank" class="act-link" onclick="event.stopPropagation();">📍 Google Maps</a>
              <a href="${eventItem.waze_url}" target="_blank" class="act-link" onclick="event.stopPropagation();">🚗 Waze</a>
            </div>
          </div>
        </article>`;
    }).join('');

    box.innerHTML = `<div class="table-cat-title">
      <span class="cat-title-label"><span class="cat-title-icon">${category.icon}</span>${category.title}</span>
      <span class="cat-badge" id="cat-badge-${category.key}">${eventCountLabel(category.items.length)}</span>
      </div><div class="event-cards">${cards}</div>`;
    container.appendChild(box);
  });

  var emptyState = document.createElement('div');
  emptyState.className = 'no-results';
  emptyState.id = 'noResults';
  emptyState.innerHTML = `<span class="no-results-icon">🔎</span><strong>לא נמצאו ${currentYearConfig.itemNoun}</strong><br>נסו לשנות את החיפוש או לבחור מסנן אחר`;
  container.appendChild(emptyState);
}

function updateYearInterface() {
  var reportsCount = (currentYearConfig.districtReports || []).length;
  document.getElementById('headerSubtitle').innerText = 'מוקד רואה וביטחון עירוני | ' + currentYearConfig.subtitle;
  document.getElementById('sidebarTitle').innerText = '📋 ' + currentYearConfig.title;
  document.getElementById('searchInput').placeholder = currentYearConfig.searchPlaceholder;
  document.getElementById('visibleCounter').innerText = reportsCount
    ? `${eventsData.length} ${currentYearConfig.itemNoun} · ${reportsCount} דיווחים`
    : `מציג ${eventsData.length} מתוך ${eventsData.length}`;
  document.getElementById('mobileEventsLabel').innerText = `${currentYearConfig.itemNoun} (${eventsData.length})`;
  document.title = `מוקד רואה וביטחון עירוני - לוד | ${currentYearConfig.title}`;

  document.querySelectorAll('.year-btn').forEach(function(button) {
    var isActive = button.id === 'yearBtn' + currentYear;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function switchYear(year) {
  if (!dashboardYears[year]) return;
  currentYear = year;
  currentYearConfig = dashboardYears[year];
  eventsData = currentYearConfig.events;
  currentFilter = 'all';
  currentSearch = '';
  activeEventId = null;

  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  closeDrawer();
  map.closePopup();
  updateYearInterface();
  renderFilterChips();
  renderLegend();
  renderMarkers();
  buildSidebarTables();
  updateVisibility();

  var pageUrl = new URL(window.location.href);
  pageUrl.searchParams.set('year', currentYear);
  window.history.replaceState({}, '', pageUrl);
}

function selectEvent(id, source) {
  activeEventId = id;
  var eventItem = eventsData.find(function(item) { return item.id === id; });
  var marker = markerInstances[id];
  if (!eventItem || !marker) return;

  document.querySelectorAll('.event-card').forEach(function(card) { card.classList.remove('active-row'); });
  var targetCard = document.getElementById('row-ev-' + id);
  if (targetCard) {
    targetCard.classList.add('active-row');
    if (source === 'map') targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.querySelectorAll('.leaflet-incident-div-icon').forEach(function(pin) { pin.classList.remove('selected-pin'); });
  var pinElement = marker.getElement();
  if (pinElement) pinElement.classList.add('selected-pin');
  map.setView(marker.getLatLng(), 16, { animate: true });

  if (window.innerWidth <= 992) {
    openMobileDrawer(eventItem);
    if (source === 'table') switchTab('map');
  } else {
    marker.openPopup();
  }
}

function selectDistrictReport(id, source) {
  var reports = currentYearConfig.districtReports || [];
  var report = reports.find(function(item) { return item.id === id; });
  var marker = districtMarkerInstances[id];
  if (!report || !marker) return;

  clearActiveRow();
  var targetCard = document.getElementById('report-card-' + id);
  if (targetCard) {
    targetCard.classList.add('active-report');
    if (source === 'map') targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  var pinElement = marker.getElement();
  if (pinElement) pinElement.classList.add('selected-pin');
  map.setView(marker.getLatLng(), 16, { animate: true });
  marker.openPopup();

  if (window.innerWidth <= 992 && source === 'table') switchTab('map');
}

function clearActiveRow() {
  activeEventId = null;
  document.querySelectorAll('.event-card').forEach(function(card) { card.classList.remove('active-row'); });
  document.querySelectorAll('.leaflet-incident-div-icon').forEach(function(pin) { pin.classList.remove('selected-pin'); });
  document.querySelectorAll('.district-report-card').forEach(function(card) { card.classList.remove('active-report'); });
}

function openMobileDrawer(eventItem) {
  var drawer = document.getElementById('mobileDrawer');
  document.getElementById('drawerTitle').innerHTML = `${eventItem.icon} ${eventItem.street} (${eventItem.event})`;
  document.getElementById('drawerLoc').innerText = `📍 ${eventItem.day} | ${eventItem.area}`;
  document.getElementById('drawerDesc').innerHTML = `<strong>פירוט:</strong> ${eventItem.notes}<br><strong>סטטוס:</strong> ${eventItem.action}`;
  document.getElementById('drawerGmapsBtn').href = eventItem.gmaps_url;
  document.getElementById('drawerWazeBtn').href = eventItem.waze_url;
  drawer.style.display = 'block';
}

function closeDrawer() {
  document.getElementById('mobileDrawer').style.display = 'none';
}

function applyFilter(button, filterKey) {
  currentFilter = filterKey;
  document.querySelectorAll('.chip').forEach(function(chip) { chip.classList.remove('active'); });
  if (button) button.classList.add('active');
  clearActiveRow();
  closeDrawer();
  updateVisibility();

  if (filterKey === 'district:reports') {
    fitLodBounds();
    if (window.innerWidth <= 992) switchTab('list');
  }
}

function handleSearch(query) {
  currentSearch = query.trim().toLowerCase();
  document.getElementById('searchClear').style.display = currentSearch ? 'flex' : 'none';
  updateVisibility();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  handleSearch('');
}

function updateVisibility() {
  var visibleMarkers = [];
  var visibleCount = 0;
  var visibleReportsCount = 0;

  eventsData.forEach(function(eventItem) {
    var marker = markerInstances[eventItem.id];
    var matchesFilter = currentFilter === 'all';
    if (currentFilter.startsWith('day:')) matchesFilter = eventItem.day_code === currentFilter.split(':')[1];
    else if (currentFilter.startsWith('cat:')) matchesFilter = eventItem.category === currentFilter.split(':')[1];

    var searchableText = [eventItem.street, eventItem.area, eventItem.event, eventItem.notes, eventItem.day, eventItem.category_title].join(' ').toLowerCase();
    var shouldShow = matchesFilter && (!currentSearch || searchableText.includes(currentSearch));

    if (shouldShow) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      visibleMarkers.push(marker);
      visibleCount += 1;
    } else if (map.hasLayer(marker)) marker.remove();

    var card = document.getElementById('row-ev-' + eventItem.id);
    if (card) card.style.display = shouldShow ? '' : 'none';
  });

  document.querySelectorAll('.report-table-box').forEach(function(box) {
    var cards = box.querySelectorAll('.event-card');
    var visibleCards = Array.from(cards).filter(function(card) { return card.style.display !== 'none'; });
    box.style.display = visibleCards.length ? '' : 'none';
    var badge = document.getElementById('cat-badge-' + box.getAttribute('data-cat'));
    if (badge) badge.innerText = eventCountLabel(visibleCards.length);
  });

  var districtSection = document.getElementById('districtReportsSection');
  if (districtSection) {
    districtSection.querySelectorAll('.district-report-card').forEach(function(card) {
      var matchesReportSearch = !currentSearch || card.getAttribute('data-search').includes(currentSearch);
      var showReport = (currentFilter === 'all' || currentFilter === 'district:reports') && matchesReportSearch;
      card.style.display = showReport ? '' : 'none';
      var reportId = card.id.replace('report-card-', '');
      var reportMarker = districtMarkerInstances[reportId];
      if (showReport) {
        if (reportMarker && !map.hasLayer(reportMarker)) reportMarker.addTo(map);
        if (reportMarker) visibleMarkers.push(reportMarker);
        visibleReportsCount += 1;
      } else if (reportMarker && map.hasLayer(reportMarker)) {
        reportMarker.remove();
      }
    });
    districtSection.style.display = visibleReportsCount ? '' : 'none';
  }

  document.getElementById('visibleCounter').innerText = currentFilter === 'district:reports'
    ? `${visibleReportsCount} דיווחי מנהלי רובע`
    : visibleReportsCount
      ? `${visibleCount} ${currentYearConfig.itemNoun} · ${visibleReportsCount} דיווחים`
      : `מציג ${visibleCount} מתוך ${eventsData.length}`;
  document.getElementById('noResults').style.display = visibleCount === 0 && visibleReportsCount === 0 ? 'block' : 'none';

  if (visibleMarkers.length && (currentFilter !== 'all' || currentSearch)) {
    map.fitBounds(L.featureGroup(visibleMarkers).getBounds(), { padding: [60, 60], maxZoom: 15 });
  } else if (currentFilter === 'all' && !currentSearch) fitLodBounds();
}

function switchTab(tab) {
  var mapElement = document.getElementById('mapViewTab');
  var sidebarElement = document.getElementById('sidebarViewTab');
  var mapButton = document.getElementById('tabBtnMap');
  var listButton = document.getElementById('tabBtnList');
  var legendButton = document.getElementById('tabBtnLegend');

  mapButton.classList.remove('active');
  listButton.classList.remove('active');
  legendButton.classList.remove('active');
  if (tab === 'map') {
    mapElement.style.display = 'block';
    sidebarElement.style.display = 'none';
    mapButton.classList.add('active');
    setTimeout(function() { map.invalidateSize(); }, 100);
  } else if (tab === 'list') {
    mapElement.style.display = 'none';
    sidebarElement.style.display = 'flex';
    listButton.classList.add('active');
    closeDrawer();
  } else if (tab === 'legend') {
    mapElement.style.display = 'block';
    sidebarElement.style.display = 'none';
    legendButton.classList.add('active');
    var legend = document.getElementById('desktopLegend');
    legend.style.display = legend.style.display === 'block' ? 'none' : 'block';
    setTimeout(function() { map.invalidateSize(); }, 100);
  }
}

var mobileLayoutActive = window.innerWidth <= 992;
var responsiveResizeTimer;

window.addEventListener('resize', function() {
  clearTimeout(responsiveResizeTimer);
  responsiveResizeTimer = setTimeout(function() {
    var isMobileLayout = window.innerWidth <= 992;
    if (isMobileLayout === mobileLayoutActive) {
      if (!isMobileLayout) {
        map.invalidateSize();
        positionDesktopLegend();
      }
      return;
    }

    mobileLayoutActive = isMobileLayout;
    var mapElement = document.getElementById('mapViewTab');
    var sidebarElement = document.getElementById('sidebarViewTab');
    var legend = document.getElementById('desktopLegend');

    if (isMobileLayout) {
      legend.style.display = 'none';
      switchTab('map');
    } else {
      mapElement.style.display = 'block';
      sidebarElement.style.display = 'flex';
      legend.style.display = 'block';
      document.getElementById('tabBtnMap').classList.add('active');
      document.getElementById('tabBtnList').classList.remove('active');
      document.getElementById('tabBtnLegend').classList.remove('active');
      setTimeout(function() {
        map.invalidateSize();
        positionDesktopLegend();
      }, 100);
    }
  }, 120);
});

function shareSummaryWhatsApp() {
  var categoryLines = uniqueCategoryGroups().map(function(category) {
    var locations = category.items.map(function(item) {
      return item.street + (item.case_count > 1 ? ` (${item.case_count} מקרים)` : '');
    }).join(', ');
    return `*${category.icon} ${category.title}:* ${locations}`;
  }).join('\n');

  var text = `📢 *${currentYearConfig.title} – עיריית לוד*\n\n${categoryLines}\n\n` +
    `לצפייה במפה האינטראקטיבית ובניווט ישיר: ${window.location.href}`;
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
}

var requestedYear = new URLSearchParams(window.location.search).get('year');
switchYear(dashboardYears[requestedYear] ? requestedYear : '2026');

var requestedView = new URLSearchParams(window.location.search).get('view');
if (requestedView === 'list' && window.innerWidth <= 992) switchTab('list');
