// Abandoned vehicles & car scrap area.
// A standalone module, unrelated to the Yom Kippur operation: it reuses the map
// and sidebar shell from app.js but has its own markers, filters and report.
// Loaded before app.js; everything here runs only after app.js has set up the map.

var currentModule = 'kippur';
var vehiclesLayer = null;
var vehicleStreetMarkers = {};
var vehiclesTooltipReady = false;
var vehiclesZoomListenerReady = false;

// Street names on the map appear from this zoom level (and on hover / selection).
var VEHICLE_LABEL_MIN_ZOOM = 15;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function(character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function vehicleZones() {
  return abandonedVehiclesReport.zones;
}

// Zones that have hotspot streets on the map ("other areas" has none).
function mappedVehicleZones() {
  return vehicleZones().filter(function(zone) { return zone.hotspots.length > 0; });
}

function findVehicleZone(zoneKey) {
  return vehicleZones().find(function(zone) { return zone.key === zoneKey; });
}

function findZoneOfStreet(street) {
  return vehicleZones().find(function(zone) { return zone.hotspots.indexOf(street) !== -1; });
}

function streetLocation(street) {
  return (abandonedVehiclesReport.streetLocations || {})[street] || null;
}

function vehicleHotspotCount() {
  return vehicleZones().reduce(function(total, zone) { return total + zone.hotspots.length; }, 0);
}

function requestCountLabel(street) {
  var count = (abandonedVehiclesReport.requestCounts || {})[street];
  if (!count) return '';
  return count === 1 ? 'פנייה אחת' : count + ' פניות';
}

function streetMapsUrl(street) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(street + ', לוד');
}

function streetWazeUrl(street) {
  return 'https://waze.com/ul?q=' + encodeURIComponent(street + ' לוד') + '&navigate=yes';
}

function findStreetRow(street) {
  return Array.from(document.querySelectorAll('#vehiclesReport .vr-street')).find(function(row) {
    return row.getAttribute('data-street') === street;
  });
}

// ---------------------------------------------------------------------------
// Module switching
// ---------------------------------------------------------------------------

function switchModule(moduleKey) {
  if (moduleKey !== 'vehicles') moduleKey = 'kippur';
  currentModule = moduleKey;
  currentFilter = 'all';
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  closeDrawer();
  map.closePopup();
  hideVehiclesTooltip();

  document.body.classList.toggle('module-vehicles', moduleKey === 'vehicles');
  document.querySelectorAll('.module-tab').forEach(function(tab) {
    var isActive = tab.getAttribute('data-module') === moduleKey;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });

  if (moduleKey === 'vehicles') {
    removeKippurMarkers();
    enterVehiclesModule();
  } else {
    if (vehiclesLayer) {
      vehiclesLayer.remove();
      vehiclesLayer = null;
    }
    vehicleStreetMarkers = {};
    updateStreetLabels();
    switchYear(currentYear);
  }

  var pageUrl = new URL(window.location.href);
  if (moduleKey === 'vehicles') {
    pageUrl.searchParams.set('mode', 'vehicles');
    pageUrl.searchParams.delete('year');
  } else {
    pageUrl.searchParams.delete('mode');
  }
  window.history.replaceState({}, '', pageUrl);
}

function removeKippurMarkers() {
  Object.values(markerInstances).forEach(function(marker) { marker.remove(); });
  Object.values(districtMarkerInstances).forEach(function(marker) { marker.remove(); });
  markerInstances = {};
  districtMarkerInstances = {};
}

function enterVehiclesModule() {
  var report = abandonedVehiclesReport;
  document.getElementById('headerTitle').innerText = report.title;
  document.getElementById('headerSubtitle').innerText = report.subtitle;
  document.getElementById('sidebarTitle').innerText = report.sidebarTitle;
  document.getElementById('sidebarHint').innerText = report.sidebarHint;
  document.getElementById('searchInput').placeholder = report.searchPlaceholder;
  document.getElementById('mobileEventsLabel').innerText = 'תמונת מצב';
  document.title = 'עיריית לוד | ' + report.title;

  renderVehiclesChips();
  renderVehiclesLegend();
  renderVehiclesMap();
  buildVehiclesReport();
  initVehiclesTooltip();
  updateVehiclesVisibility();
  document.getElementById('vehiclesReport').scrollTop = 0;
}

// ---------------------------------------------------------------------------
// Map: one pin per hotspot street, in its zone's color, with its request count
// ---------------------------------------------------------------------------

function renderVehiclesMap() {
  if (vehiclesLayer) vehiclesLayer.remove();
  vehiclesLayer = L.layerGroup().addTo(map);
  vehicleStreetMarkers = {};

  if (!vehiclesZoomListenerReady) {
    vehiclesZoomListenerReady = true;
    map.on('zoomend', updateStreetLabels);
  }

  mappedVehicleZones().forEach(function(zone) {
    zone.hotspots.forEach(function(street) {
      var location = streetLocation(street);
      if (!location) return;
      var count = (abandonedVehiclesReport.requestCounts || {})[street] || '';
      var countText = requestCountLabel(street);

      var icon = L.divIcon({
        html: `<div class="vehicle-street-pin" style="--zone:${zone.color}; --zone-ink:${zone.ink};">
            <span class="street-pin-dot">${count}</span>
            <span class="street-pin-label">${escapeHtml(street)}</span>
          </div>`,
        className: 'leaflet-incident-div-icon vehicle-street-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -16]
      });

      var popupHtml = `
        <div class="popup-header vehicle-popup-header" style="--zone:${zone.color};">
          <span style="font-weight:900; font-size:12.5px;">🚗 רכבים נטושים · ${escapeHtml(zone.name)}</span>
          <span style="font-size:12px; font-weight:800;">${escapeHtml(countText)}</span>
        </div>
        <div class="popup-body">
          <div class="popup-title">${escapeHtml(street)}</div>
          <div class="popup-loc">📍 ${escapeHtml(zone.name)} · ${zone.share}% מפניות העיר</div>
          <div class="popup-desc"><strong>פניות פתוחות ברחוב:</strong> ${escapeHtml(countText || '—')}<br>
            <strong>הערה:</strong> הסימון מציין את הרחוב ולא כתובת מסוימת</div>
          <div class="popup-actions">
            <a href="${streetMapsUrl(street)}" target="_blank" rel="noopener" class="popup-btn">📍 Google Maps</a>
            <a href="${streetWazeUrl(street)}" target="_blank" rel="noopener" class="popup-btn waze">🚗 Waze</a>
          </div>
        </div>
      `;

      var marker = L.marker([location.lat, location.lng], { icon: icon, title: street, riseOnHover: true });
      marker.on('click', function(clickEvent) {
        L.DomEvent.stopPropagation(clickEvent);
        selectStreet(street, 'map');
      });
      marker.bindPopup(popupHtml);
      marker.addTo(vehiclesLayer);
      vehicleStreetMarkers[street] = marker;
    });
  });

  updateStreetLabels();
}

function updateStreetLabels() {
  var showLabels = currentModule === 'vehicles' && map.getZoom() >= VEHICLE_LABEL_MIN_ZOOM;
  map.getContainer().classList.toggle('vr-show-street-labels', showLabels);
}

// Fit the map to the street pins that are currently shown.
function fitVehiclesView() {
  var zoneFilter = currentFilter.indexOf('zone:') === 0;
  var visibleMarkers = Object.values(vehicleStreetMarkers).filter(function(marker) {
    return vehiclesLayer && vehiclesLayer.hasLayer(marker);
  });
  if (visibleMarkers.length && (zoneFilter || currentSearch)) {
    map.fitBounds(L.featureGroup(visibleMarkers).getBounds(), { padding: [70, 70], maxZoom: 16 });
  } else if (!zoneFilter && !currentSearch) {
    fitLodBounds();
  }
}

// Brings back every street (clears the zone filter and the search) without moving the map.
function resetVehiclesFilters() {
  currentFilter = 'all';
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  document.querySelectorAll('.chip').forEach(function(chip) {
    chip.classList.toggle('active', chip.getAttribute('data-filter') === 'all');
  });
  updateVehiclesVisibility({ keepView: true });
}

function selectStreet(street, source) {
  var marker = vehicleStreetMarkers[street];
  var zone = findZoneOfStreet(street);
  if (!marker || !zone) return;
  if (!vehiclesLayer.hasLayer(marker)) resetVehiclesFilters();

  clearActiveRow();
  var row = findStreetRow(street);
  if (row) {
    row.classList.add('vr-active');
    if (source === 'map') row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  var pinElement = marker.getElement();
  if (pinElement) pinElement.classList.add('selected-pin');
  map.setView(marker.getLatLng(), 16, { animate: true });

  if (window.innerWidth <= 992) {
    openStreetDrawer(street, zone);
    if (source === 'table') switchTab('map');
  } else {
    marker.openPopup();
  }
}

// Selecting a zone filters the map and the hotspot list to that zone's streets.
function selectZone(zoneKey, source) {
  var chip = document.querySelector('.chip[data-filter="zone:' + zoneKey + '"]');
  if (!chip) return;
  applyFilter(chip, 'zone:' + zoneKey);
  document.querySelectorAll('#vehiclesReport [data-zone="' + zoneKey + '"]').forEach(function(element) {
    if (element.classList.contains('vr-zone-bar') || element.classList.contains('vr-zone-group')) {
      element.classList.add('vr-active');
    }
  });
  if (window.innerWidth <= 992 && source === 'table') {
    switchTab('map');
    setTimeout(fitVehiclesView, 150);
  }
}

function openStreetDrawer(street, zone) {
  var countText = requestCountLabel(street);
  document.getElementById('drawerTitle').textContent = '🚗 ' + street;
  document.getElementById('drawerLoc').textContent = '📍 ' + zone.name + (countText ? ' · ' + countText + ' פתוחות' : '');
  document.getElementById('drawerDesc').innerHTML = '<strong>הערה:</strong> הסימון מציין את הרחוב ולא כתובת מסוימת';
  document.getElementById('drawerGmapsBtn').href = streetMapsUrl(street);
  document.getElementById('drawerWazeBtn').href = streetWazeUrl(street);
  document.getElementById('mobileDrawer').style.display = 'block';
}

// ---------------------------------------------------------------------------
// Filter chips & legend
// ---------------------------------------------------------------------------

function renderVehiclesChips() {
  var chips = [
    `<button class="chip active" data-filter="all" onclick="applyFilter(this, 'all')">הכל · ${vehicleHotspotCount()} מוקדים</button>`
  ];
  mappedVehicleZones().forEach(function(zone) {
    chips.push(`<button class="chip zone-chip" data-filter="zone:${zone.key}" onclick="applyFilter(this, 'zone:${zone.key}')">
      <span class="chip-dot" style="background:${zone.color};" aria-hidden="true"></span>${escapeHtml(zone.name)} · ${zone.share}%</button>`);
  });
  document.getElementById('filterChips').innerHTML = chips.join('');
  positionDesktopLegend();
}

function renderVehiclesLegend() {
  document.getElementById('legendTitle').innerText = 'מקרא – רכבים נטושים';
  var legendHtml = vehicleZones().map(function(zone) {
    var mapped = zone.hotspots.length > 0;
    return `<div class="legend-line"><span>${escapeHtml(zone.name)} · ${zone.share}%</span>
      <div class="legend-icon legend-zone-dot${mapped ? '' : ' is-unmapped'}" style="--zone:${zone.color};"></div></div>`;
  }).join('');
  legendHtml += '<div class="legend-note">המספר בעיגול = פניות פתוחות ברחוב<br>שמות הרחובות מופיעים בהגדלה</div>';
  document.getElementById('legendItems').innerHTML = legendHtml;
  positionDesktopLegend();
}

// ---------------------------------------------------------------------------
// Sidebar report
// ---------------------------------------------------------------------------

function sectionHead(icon, title, pill) {
  return `<div class="vr-section-head">
      <h3><span class="vr-h-icon" aria-hidden="true">${icon}</span>${escapeHtml(title)}</h3>
      ${pill ? `<span class="vr-pill">${escapeHtml(pill)}</span>` : ''}
    </div>`;
}

// One horizontal bar per row, growing from the right (RTL baseline), value at the tip.
function barRowHtml(options) {
  var ratio = (options.share / options.maxShare).toFixed(4);
  var valueText = options.valueText || options.share + '%';
  var reserve = options.reserve || 46;
  var interactive = options.onSelect
    ? ` tabindex="0" role="button" onclick="${options.onSelect}"
        onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); ${options.onSelect}; }"`
    : ' tabindex="0"';
  return `
    <div class="vr-bar-row ${options.className || ''}${options.onSelect ? ' is-clickable' : ''}"${options.zoneKey ? ` data-zone="${options.zoneKey}"` : ''}${interactive}
      data-tip-value="${escapeHtml(valueText)}" data-tip-label="${escapeHtml(options.label)}" data-tip-extra="${escapeHtml(options.tipExtra || '')}"
      aria-label="${escapeHtml(options.label)}: ${escapeHtml(valueText)}">
      <div class="vr-bar-head">${options.marker}<span class="vr-bar-name">${escapeHtml(options.label)}</span></div>
      <div class="vr-bar-line">
        <span class="vr-bar-fill" style="--fill:${options.color}; width:calc((100% - ${reserve}px) * ${ratio});"></span>
        <span class="vr-bar-value">${escapeHtml(valueText)}</span>
      </div>
      ${options.note ? `<div class="vr-bar-note">${escapeHtml(options.note)}</div>` : ''}
    </div>`;
}

function buildVehiclesReport() {
  var report = abandonedVehiclesReport;
  var container = document.getElementById('vehiclesReport');
  var hotspotTotal = vehicleHotspotCount();

  var kpiTiles = report.kpis.map(function(kpi) {
    return `<div class="vr-kpi${kpi.wide ? ' vr-kpi-wide' : ''}">
        <span class="vr-kpi-icon" aria-hidden="true">${kpi.icon}</span>
        <div class="vr-kpi-copy">
          <span class="vr-kpi-label">${escapeHtml(kpi.label)}</span>
          <strong class="vr-kpi-value">${escapeHtml(kpi.value)}</strong>
        </div>
      </div>`;
  }).join('');

  var hazardCards = report.hazard.aspects.map(function(aspect) {
    return `<div class="vr-aspect">
        <span class="vr-aspect-icon" aria-hidden="true">${aspect.icon}</span>
        <div><strong>${escapeHtml(aspect.title)}</strong><p>${escapeHtml(aspect.text)}</p></div>
      </div>`;
  }).join('');

  var maxZoneShare = Math.max.apply(null, report.zones.map(function(zone) { return zone.share; }));
  var zoneBars = report.zones.map(function(zone) {
    var mapped = zone.hotspots.length > 0;
    return barRowHtml({
      className: 'vr-zone-bar',
      zoneKey: zone.key,
      label: zone.name,
      share: zone.share,
      maxShare: maxZoneShare,
      color: zone.color,
      note: zone.chartNote,
      marker: `<span class="vr-swatch" style="background:${zone.color};" aria-hidden="true"></span>`,
      tipExtra: mapped ? zone.hotspots.length + ' מוקדים לטיפול · לחיצה למיקוד במפה' : 'פיזור ביתר אזורי העיר',
      onSelect: mapped ? `selectZone('${zone.key}', 'table')` : null
    });
  }).join('');

  var maxTypeShare = Math.max.apply(null, report.complaintTypes.map(function(type) { return type.share; }));
  var typeBars = report.complaintTypes.map(function(type) {
    return barRowHtml({
      className: 'vr-type-bar',
      label: type.label,
      share: type.share,
      maxShare: maxTypeShare,
      color: 'var(--vr-accent)',
      marker: `<span class="vr-type-icon" aria-hidden="true">${type.icon}</span>`,
      tipExtra: 'מסך התלונות'
    });
  }).join('');

  var zoneGroups = report.zones.filter(function(zone) { return zone.hotspots.length; }).map(function(zone) {
    var streets = zone.hotspots.map(function(street) {
      var location = streetLocation(street);
      var searchText = (street + ' ' + zone.name + ' ' + (location && location.area ? location.area : '')).toLowerCase();
      return `<li class="vr-street" data-zone="${zone.key}" data-street="${escapeHtml(street)}" data-search="${escapeHtml(searchText)}">
          <button type="button" class="vr-street-main" onclick="selectStreet(this.closest('.vr-street').getAttribute('data-street'), 'table')">
            <span class="vr-street-pin" aria-hidden="true">📍</span><span class="vr-street-name">${escapeHtml(street)}</span>
            ${requestCountLabel(street) ? `<span class="vr-street-count">${requestCountLabel(street)}</span>` : ''}
          </button>
          <span class="vr-street-links">
            <a href="${streetMapsUrl(street)}" target="_blank" rel="noopener" class="act-link">📍 Google Maps</a>
            <a href="${streetWazeUrl(street)}" target="_blank" rel="noopener" class="act-link">🚗 Waze</a>
          </span>
        </li>`;
    }).join('');
    return `<div class="vr-zone-group" data-zone="${zone.key}" style="--zone:${zone.color};">
        <button type="button" class="vr-zone-head" onclick="selectZone('${zone.key}', 'table')">
          <span class="vr-swatch" style="background:${zone.color};" aria-hidden="true"></span>
          <strong>${escapeHtml(zone.name)}</strong>
          <span class="vr-zone-meta">${zone.share}% מהפניות · ${zone.hotspots.length} מוקדים</span>
        </button>
        <ul class="vr-street-list">${streets}</ul>
      </div>`;
  }).join('');

  // Open requests by opening month, stacked by status (in treatment → not yet handled).
  var maxMonthTotal = Math.max.apply(null, report.monthly.map(function(month) { return month.inTreatment + month.pending; }));
  var monthRows = report.monthly.map(function(month) {
    var total = month.inTreatment + month.pending;
    var ratio = (total / maxMonthTotal).toFixed(4);
    function segment(value, className) {
      if (!value) return '';
      var label = value / maxMonthTotal >= 0.12 ? value : '';
      return `<span class="vr-seg ${className}" style="flex:${value} 1 0;">${label}</span>`;
    }
    var detail = month.inTreatment + ' בטיפול · ' + month.pending + ' טרם עברו לטיפול';
    return `<div class="vr-bar-row vr-month-row" tabindex="0"
        data-tip-value="${total} פניות" data-tip-label="${escapeHtml(month.label)}" data-tip-extra="${escapeHtml(detail)}"
        aria-label="${escapeHtml(month.label)}: ${total} פניות, ${escapeHtml(detail)}">
        <div class="vr-bar-head"><span class="vr-bar-name">${escapeHtml(month.label)}</span>${month.note ? `<span class="vr-bar-aside">${escapeHtml(month.note)}</span>` : ''}</div>
        <div class="vr-bar-line">
          <span class="vr-stack" style="width:calc((100% - 46px) * ${ratio});">${segment(month.inTreatment, 'seg-treatment')}${segment(month.pending, 'seg-pending')}</span>
          <span class="vr-bar-value">${total}</span>
        </div>
      </div>`;
  }).join('');

  var maxStreetCount = Math.max.apply(null, report.topStreets.map(function(item) { return item.count; }));
  var streetBars = report.topStreets.map(function(item) {
    return barRowHtml({
      className: 'vr-street-bar',
      label: item.street,
      share: item.count,
      maxShare: maxStreetCount,
      valueText: item.count + ' פניות',
      reserve: 66,
      color: 'var(--vr-accent)',
      marker: '<span class="vr-type-icon" aria-hidden="true">📍</span>',
      tipExtra: 'פניות פתוחות ברחוב'
    });
  }).join('');

  var solutionCards = report.solutions.items.map(function(item, index) {
    return `<div class="vr-solution">
        <span class="vr-solution-num" aria-hidden="true">${index + 1}</span>
        <div>
          <strong><span aria-hidden="true">${item.icon}</span> ${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.text)}</p>
        </div>
      </div>`;
  }).join('');

  var questions = report.discussionQuestions.map(function(question, index) {
    return `<li><span class="vr-q-num" aria-hidden="true">${index + 1}</span><span>${escapeHtml(question)}</span></li>`;
  }).join('');

  var controlRows = report.controlBoard.map(function(row) {
    var value = row.flagged
      ? `<span class="vr-level"><span aria-hidden="true">⚠️</span>${escapeHtml(row.value)}</span>`
      : escapeHtml(row.value);
    return `<tr><th scope="row">${escapeHtml(row.metric)}</th><td>${value}</td></tr>`;
  }).join('');

  container.innerHTML = `
    <section class="vr-section vr-hazard" data-search-hide>
      ${sectionHead('⚠️', report.hazard.title, '')}
      <p class="vr-hazard-lead">${escapeHtml(report.hazard.lead)}</p>
      <div class="vr-aspects">${hazardCards}</div>
      <div class="vr-hazard-summary"><strong>לסיכום:</strong> ${escapeHtml(report.hazard.summary)}</div>
    </section>

    <section class="vr-section vr-overview" data-search-hide>
      ${sectionHead('📊', 'נתונים כלליים', 'תמונת מצב עירונית')}
      <div class="vr-hero">
        <div class="vr-hero-value">${escapeHtml(report.total.value)}</div>
        <div class="vr-hero-copy">
          <strong>${escapeHtml(report.total.label)}</strong>
          <span>${escapeHtml(report.total.caption)}</span>
        </div>
      </div>
      <div class="vr-kpi-grid">${kpiTiles}</div>
      <p class="vr-source">${escapeHtml(report.source)}</p>
    </section>

    <section class="vr-section" data-search-hide>
      ${sectionHead('📈', 'פניות פתוחות לפי חודש פתיחה', 'נתוני המוקד')}
      <p class="vr-section-sub">הפניות הפתוחות כיום לפי החודש שבו נפתחו ולפי סטטוס הטיפול</p>
      <div class="vr-legend">
        <span><i class="seg-treatment" aria-hidden="true"></i>בטיפול (${report.stats.inTreatment})</span>
        <span><i class="seg-pending" aria-hidden="true"></i>טרם עברו לטיפול (${report.stats.pending})</span>
      </div>
      <div class="vr-bars">${monthRows}</div>
    </section>

    <section class="vr-section" data-search-hide>
      ${sectionHead('🗺️', 'חלוקת מוקדי הפניות', 'גרף 1')}
      <p class="vr-section-sub">שיעור מסך הפניות לפי אזור בעיר · לחיצה על אזור ממקדת את המפה</p>
      <div class="vr-bars">${zoneBars}</div>
    </section>

    <section class="vr-section" data-search-hide>
      ${sectionHead('🚘', 'סוגי התלונות', 'גרף 2')}
      <p class="vr-section-sub">שיעור מסך התלונות לפי סוג המפגע</p>
      <div class="vr-bars">${typeBars}</div>
    </section>

    <section class="vr-section" data-search-hide>
      ${sectionHead('🏘️', 'רחובות עם הכי הרבה פניות', 'נתוני המוקד')}
      <p class="vr-section-sub">מספר הפניות הפתוחות בכל רחוב</p>
      <div class="vr-bars">${streetBars}</div>
      <p class="vr-chart-foot">${escapeHtml(report.topStreetsNote)}</p>
    </section>

    <section class="vr-section vr-hotspots" id="vrHotspots">
      ${sectionHead('🎯', 'מוקדים בולטים לטיפול', hotspotTotal + ' מוקדים')}
      <div class="vr-zone-groups">${zoneGroups}</div>
      <div class="no-results" id="vrNoResults"><span class="no-results-icon">🔎</span><strong>לא נמצאו מוקדים</strong><br>נסו לחפש רחוב או שכונה אחרים</div>
    </section>

    <section class="vr-section" data-search-hide>
      ${sectionHead('❓', 'שאלות לדיון', report.discussionQuestions.length + ' שאלות')}
      <ol class="vr-questions">${questions}</ol>
    </section>

    <section class="vr-section" data-search-hide>
      ${sectionHead('🧭', 'לוח בקרה ניהולי', '')}
      <table class="vr-table">
        <thead><tr><th scope="col">מדד</th><th scope="col">נתון</th></tr></thead>
        <tbody>${controlRows}</tbody>
      </table>
    </section>

    <section class="vr-summary" data-search-hide>
      <div class="vr-summary-title"><span aria-hidden="true">📌</span>מסר מסכם</div>
      <p>${escapeHtml(report.summary)}</p>
    </section>

    <section class="vr-section vr-solutions" data-search-hide>
      ${sectionHead('💡', report.solutions.title, report.solutions.items.length + ' פתרונות')}
      <div class="vr-solution-list">${solutionCards}</div>
      <div class="vr-solutions-summary"><strong>לסיכום:</strong> ${escapeHtml(report.solutions.summary)}</div>
    </section>
  `;
}

function updateVehiclesVisibility(options) {
  var keepView = options && options.keepView;
  var zoneFilter = currentFilter.indexOf('zone:') === 0 ? currentFilter.slice(5) : null;
  var totalStreets = 0;
  var visibleStreets = 0;
  var zonesWithMatches = {};
  var streetsShown = {};

  document.querySelectorAll('#vehiclesReport .vr-street').forEach(function(street) {
    var zoneKey = street.getAttribute('data-zone');
    var show = (!zoneFilter || zoneKey === zoneFilter)
      && (!currentSearch || street.getAttribute('data-search').includes(currentSearch));
    street.style.display = show ? '' : 'none';
    totalStreets += 1;
    if (show) {
      visibleStreets += 1;
      zonesWithMatches[zoneKey] = true;
      streetsShown[street.getAttribute('data-street')] = true;
    }
  });

  document.querySelectorAll('#vehiclesReport .vr-zone-group').forEach(function(group) {
    group.style.display = zonesWithMatches[group.getAttribute('data-zone')] ? '' : 'none';
  });

  // While searching, the hotspot list is the only section that answers the query.
  document.querySelectorAll('#vehiclesReport [data-search-hide]').forEach(function(section) {
    section.style.display = currentSearch ? 'none' : '';
  });

  // A zone filter keeps the city-wide chart but emphasises the selected zone.
  document.querySelectorAll('#vehiclesReport .vr-zone-bar').forEach(function(row) {
    row.classList.toggle('is-dimmed', !!zoneFilter && row.getAttribute('data-zone') !== zoneFilter);
  });

  document.getElementById('vrNoResults').style.display = visibleStreets ? 'none' : 'block';
  document.getElementById('visibleCounter').innerText = zoneFilter || currentSearch
    ? `מציג ${visibleStreets} מתוך ${totalStreets} מוקדים`
    : `${abandonedVehiclesReport.total.value} פניות · ${totalStreets} מוקדים`;

  // The map shows exactly the streets listed in the sidebar.
  Object.keys(vehicleStreetMarkers).forEach(function(streetName) {
    var marker = vehicleStreetMarkers[streetName];
    if (streetsShown[streetName]) {
      if (!vehiclesLayer.hasLayer(marker)) marker.addTo(vehiclesLayer);
    } else {
      vehiclesLayer.removeLayer(marker);
    }
  });

  if (!keepView) fitVehiclesView();
}

// ---------------------------------------------------------------------------
// Chart tooltip (hover & keyboard focus); every value is also printed on the bars.
// ---------------------------------------------------------------------------

function hideVehiclesTooltip() {
  var tooltip = document.getElementById('vrTooltip');
  if (tooltip) tooltip.classList.remove('visible');
}

function initVehiclesTooltip() {
  if (vehiclesTooltipReady) return;
  vehiclesTooltipReady = true;

  var tooltip = document.createElement('div');
  tooltip.className = 'vr-tooltip';
  tooltip.id = 'vrTooltip';
  tooltip.setAttribute('role', 'tooltip');
  var valueLine = document.createElement('strong');
  var labelLine = document.createElement('span');
  var extraLine = document.createElement('em');
  tooltip.append(valueLine, labelLine, extraLine);
  document.body.appendChild(tooltip);

  function showFor(target, x, y) {
    valueLine.textContent = target.getAttribute('data-tip-value');
    labelLine.textContent = target.getAttribute('data-tip-label');
    extraLine.textContent = target.getAttribute('data-tip-extra') || '';
    extraLine.style.display = extraLine.textContent ? '' : 'none';
    var halfWidth = Math.min(tooltip.offsetWidth || 160, 240) / 2;
    tooltip.style.left = Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, x)) + 'px';
    tooltip.style.top = Math.max(70, y) + 'px';
    tooltip.classList.add('visible');
  }

  var container = document.getElementById('vehiclesReport');
  container.addEventListener('pointermove', function(pointerEvent) {
    if (pointerEvent.pointerType === 'touch') return;
    var target = pointerEvent.target.closest('[data-tip-value]');
    if (target) showFor(target, pointerEvent.clientX, pointerEvent.clientY);
    else hideVehiclesTooltip();
  });
  container.addEventListener('pointerleave', hideVehiclesTooltip);
  container.addEventListener('scroll', hideVehiclesTooltip);
  container.addEventListener('focusin', function(focusEvent) {
    var target = focusEvent.target.closest('[data-tip-value]');
    if (!target) return;
    var rect = target.getBoundingClientRect();
    showFor(target, rect.left + rect.width / 2, rect.top + 6);
  });
  container.addEventListener('focusout', hideVehiclesTooltip);
}

// ---------------------------------------------------------------------------
// WhatsApp summary
// ---------------------------------------------------------------------------

function shareVehiclesWhatsApp() {
  var report = abandonedVehiclesReport;
  var zoneSplit = report.zones.map(function(zone) { return zone.name + ' ' + zone.share + '%'; }).join(' · ');
  var mainTypes = report.complaintTypes.slice(0, 2).map(function(type) {
    return type.label + ' (' + type.share + '%)';
  }).join(', ');
  var hotspotLines = report.zones.filter(function(zone) { return zone.hotspots.length; }).map(function(zone) {
    return '• *' + zone.name + ':* ' + zone.hotspots.join(', ');
  }).join('\n');

  var text = `📢 *${report.title} – עיריית לוד*\n${report.subtitle}\n\n` +
    `📥 סה״כ פניות פתוחות: *${report.total.value}* · בטיפול ${report.stats.inTreatment} · טרם עברו לטיפול ${report.stats.pending}\n` +
    `🗓️ נפתחו בנובמבר: ${report.stats.november} · ⏳ פתוחות מעל 30 יום: ${report.stats.over30Days}\n` +
    `📍 חלוקה לפי אזור: ${zoneSplit}\n` +
    `🚗 עיקר התלונות: ${mainTypes}\n\n` +
    `🎯 *מוקדים בולטים לטיפול:*\n${hotspotLines}\n\n` +
    `📌 ${report.summary}\n\n` +
    `לצפייה בדשבורד: ${window.location.href}`;
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
}
