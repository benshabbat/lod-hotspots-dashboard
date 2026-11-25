// Abandoned vehicles & car scrap area.
// A standalone module, unrelated to the Yom Kippur operation: it reuses the map
// and sidebar shell from app.js but has its own markers, filters and report.
// Loaded before app.js; everything here runs only after app.js has set up the map.

var currentModule = 'kippur';
var vehiclesLayer = null;
var vehicleZoneMarkers = {};
var vehicleZoneHalos = {};
var vehiclesTooltipReady = false;

// Circle area on the map is proportional to the zone's share of requests.
var VEHICLE_HALO_METERS_PER_SQRT_SHARE = 65;
var VEHICLE_HALO_STYLE = { weight: 2, opacity: 0.9, fillOpacity: 0.14 };
var VEHICLE_HALO_ACTIVE_STYLE = { weight: 3.5, opacity: 1, fillOpacity: 0.26 };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function(character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function vehicleZones() {
  return abandonedVehiclesReport.zones;
}

function mappedVehicleZones() {
  return vehicleZones().filter(function(zone) { return zone.lat !== null; });
}

function findVehicleZone(zoneKey) {
  return vehicleZones().find(function(zone) { return zone.key === zoneKey; });
}

function vehicleHotspotCount() {
  return vehicleZones().reduce(function(total, zone) { return total + zone.hotspots.length; }, 0);
}

function streetMapsUrl(street) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(street + ', לוד');
}

function streetWazeUrl(street) {
  return 'https://waze.com/ul?q=' + encodeURIComponent(street + ' לוד') + '&navigate=yes';
}

function zoneMapsUrl(zone) {
  return 'https://www.google.com/maps/search/?api=1&query=' + zone.lat + ',' + zone.lng;
}

function zoneWazeUrl(zone) {
  return 'https://waze.com/ul?ll=' + zone.lat + ',' + zone.lng + '&navigate=yes';
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
// Map
// ---------------------------------------------------------------------------

function renderVehiclesMap() {
  if (vehiclesLayer) vehiclesLayer.remove();
  vehiclesLayer = L.layerGroup().addTo(map);
  vehicleZoneMarkers = {};
  vehicleZoneHalos = {};

  var isMobile = window.innerWidth <= 600;

  mappedVehicleZones().forEach(function(zone) {
    var halo = L.circle([zone.lat, zone.lng], Object.assign({
      radius: VEHICLE_HALO_METERS_PER_SQRT_SHARE * Math.sqrt(zone.share),
      color: zone.color,
      fillColor: zone.color,
      interactive: false
    }, VEHICLE_HALO_STYLE));

    var iconHtml = `
      <div class="custom-incident-pin vehicle-zone-pin" id="pin-zone-${zone.key}" style="--zone:${zone.color}; --zone-ink:${zone.ink};">
        <div class="pin-radar-ring"></div>
        <div class="pin-badge-container">
          <div class="pin-icon-circle">🚗</div>
          <div class="pin-texts">
            <div class="pin-title-row">
              <span class="pin-day-badge zone-share-badge">${zone.share}%</span>
              <span class="pin-title-text">${escapeHtml(zone.name)}</span>
            </div>
            <div class="pin-event-text">${zone.hotspots.length} מוקדים לטיפול</div>
          </div>
        </div>
      </div>
    `;

    var icon = L.divIcon({
      html: iconHtml,
      className: 'leaflet-incident-div-icon vehicle-zone-icon',
      iconSize: isMobile ? [36, 36] : [170, 44],
      iconAnchor: isMobile ? [18, 18] : [85, 22],
      popupAnchor: [0, -22]
    });

    var popupHtml = `
      <div class="popup-header vehicle-popup-header" style="--zone:${zone.color};">
        <span style="font-weight:900; font-size:12.5px;">🚗 רכבים נטושים וגרוטאות</span>
        <span style="font-size:12px; font-weight:800;">${zone.share}% מהפניות</span>
      </div>
      <div class="popup-body">
        <div class="popup-title">${escapeHtml(zone.name)}</div>
        <div class="popup-loc">📍 ${zone.hotspots.length} מוקדים בולטים לטיפול</div>
        <div class="popup-desc"><strong>מוקדים:</strong> ${escapeHtml(zone.hotspots.join(' · '))}<br>
          <strong>הערה:</strong> הסימון מציין את האזור כולו – ניווט לרחוב מסוים מתוך רשימת המוקדים</div>
        <div class="popup-actions">
          <a href="${zoneMapsUrl(zone)}" target="_blank" rel="noopener" class="popup-btn">📍 Google Maps</a>
          <a href="${zoneWazeUrl(zone)}" target="_blank" rel="noopener" class="popup-btn waze">🚗 Waze</a>
        </div>
      </div>
    `;

    var marker = L.marker([zone.lat, zone.lng], { icon: icon });
    marker.on('click', function(clickEvent) {
      L.DomEvent.stopPropagation(clickEvent);
      selectZone(zone.key, 'map');
    });
    marker.bindPopup(popupHtml);

    halo.addTo(vehiclesLayer);
    marker.addTo(vehiclesLayer);
    vehicleZoneHalos[zone.key] = halo;
    vehicleZoneMarkers[zone.key] = marker;
  });
}

function resetVehicleHalos() {
  Object.values(vehicleZoneHalos).forEach(function(halo) { halo.setStyle(VEHICLE_HALO_STYLE); });
}

function selectZone(zoneKey, source, streetElement) {
  var zone = findVehicleZone(zoneKey);
  var marker = vehicleZoneMarkers[zoneKey];
  if (!zone || !marker) return;

  // A zone hidden by the active zone filter is brought back before focusing it
  // (without re-fitting the map, which would cancel the zoom below).
  if (!vehiclesLayer.hasLayer(marker)) {
    currentFilter = 'all';
    document.querySelectorAll('.chip').forEach(function(chip) {
      chip.classList.toggle('active', chip.getAttribute('data-filter') === 'all');
    });
    updateVehiclesVisibility({ keepView: true });
  }

  clearActiveRow();
  document.querySelectorAll('#vehiclesReport [data-zone="' + zoneKey + '"]').forEach(function(element) {
    if (element.classList.contains('vr-zone-bar') || element.classList.contains('vr-zone-group')) {
      element.classList.add('vr-active');
    }
  });
  if (streetElement) streetElement.classList.add('vr-active');

  var pinElement = marker.getElement();
  if (pinElement) pinElement.classList.add('selected-pin');
  if (vehicleZoneHalos[zoneKey]) vehicleZoneHalos[zoneKey].setStyle(VEHICLE_HALO_ACTIVE_STYLE);
  map.setView(marker.getLatLng(), 15, { animate: true });

  if (window.innerWidth <= 992) {
    openZoneDrawer(zone, streetElement ? streetElement.getAttribute('data-street') : null);
    if (source === 'table') switchTab('map');
  } else {
    marker.openPopup();
    if (source === 'map') {
      var group = document.querySelector('#vehiclesReport .vr-zone-group[data-zone="' + zoneKey + '"]');
      if (group) group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function openZoneDrawer(zone, streetName) {
  document.getElementById('drawerTitle').textContent = '🚗 ' + zone.name + ' · ' + zone.share + '% מהפניות';
  document.getElementById('drawerLoc').textContent = streetName
    ? '📍 מוקד לטיפול: ' + streetName
    : '📍 ' + zone.hotspots.length + ' מוקדים בולטים לטיפול';
  document.getElementById('drawerDesc').innerHTML = '<strong>מוקדים באזור:</strong> ' + escapeHtml(zone.hotspots.join(' · '));
  document.getElementById('drawerGmapsBtn').href = streetName ? streetMapsUrl(streetName) : zoneMapsUrl(zone);
  document.getElementById('drawerWazeBtn').href = streetName ? streetWazeUrl(streetName) : zoneWazeUrl(zone);
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
    var mapped = zone.lat !== null;
    return `<div class="legend-line"><span>${escapeHtml(zone.name)} · ${zone.share}%</span>
      <div class="legend-icon" style="background:${zone.color}; color:${zone.ink}; border:1px solid ${zone.color};">${mapped ? '🚗' : '·'}</div></div>`;
  }).join('');
  legendHtml += '<div class="legend-note">גודל העיגול = שיעור הפניות באזור · יתר אזורי העיר אינם מסומנים במפה</div>';
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
  var interactive = options.onSelect
    ? ` tabindex="0" role="button" onclick="${options.onSelect}"
        onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); ${options.onSelect}; }"`
    : ' tabindex="0"';
  return `
    <div class="vr-bar-row ${options.className || ''}${options.onSelect ? ' is-clickable' : ''}"${options.zoneKey ? ` data-zone="${options.zoneKey}"` : ''}${interactive}
      data-tip-value="${options.share}%" data-tip-label="${escapeHtml(options.label)}" data-tip-extra="${escapeHtml(options.tipExtra || '')}"
      aria-label="${escapeHtml(options.label)}: ${options.share}%">
      <div class="vr-bar-head">${options.marker}<span class="vr-bar-name">${escapeHtml(options.label)}</span></div>
      <div class="vr-bar-line">
        <span class="vr-bar-fill" style="--fill:${options.color}; width:calc((100% - 46px) * ${ratio});"></span>
        <span class="vr-bar-value">${options.share}%</span>
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

  var maxZoneShare = Math.max.apply(null, report.zones.map(function(zone) { return zone.share; }));
  var zoneBars = report.zones.map(function(zone) {
    var mapped = zone.lat !== null;
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
      var searchText = (street + ' ' + zone.name).toLowerCase();
      return `<li class="vr-street" data-zone="${zone.key}" data-street="${escapeHtml(street)}" data-search="${escapeHtml(searchText)}">
          <button type="button" class="vr-street-main" onclick="selectZone('${zone.key}', 'table', this.closest('.vr-street'))">
            <span class="vr-street-pin" aria-hidden="true">📍</span><span class="vr-street-name">${escapeHtml(street)}</span>
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
  `;
}

function updateVehiclesVisibility(options) {
  var keepView = options && options.keepView;
  var zoneFilter = currentFilter.indexOf('zone:') === 0 ? currentFilter.slice(5) : null;
  var totalStreets = 0;
  var visibleStreets = 0;
  var zonesWithMatches = {};

  document.querySelectorAll('#vehiclesReport .vr-street').forEach(function(street) {
    var zoneKey = street.getAttribute('data-zone');
    var show = (!zoneFilter || zoneKey === zoneFilter)
      && (!currentSearch || street.getAttribute('data-search').includes(currentSearch));
    street.style.display = show ? '' : 'none';
    totalStreets += 1;
    if (show) {
      visibleStreets += 1;
      zonesWithMatches[zoneKey] = true;
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

  var visibleMarkers = [];
  Object.keys(vehicleZoneMarkers).forEach(function(zoneKey) {
    var marker = vehicleZoneMarkers[zoneKey];
    var halo = vehicleZoneHalos[zoneKey];
    if (zonesWithMatches[zoneKey]) {
      if (!vehiclesLayer.hasLayer(halo)) halo.addTo(vehiclesLayer);
      if (!vehiclesLayer.hasLayer(marker)) marker.addTo(vehiclesLayer);
      visibleMarkers.push(marker);
    } else {
      vehiclesLayer.removeLayer(halo);
      vehiclesLayer.removeLayer(marker);
    }
  });

  if (keepView) return;
  if (visibleMarkers.length && (zoneFilter || currentSearch)) {
    map.fitBounds(L.featureGroup(visibleMarkers).getBounds(), { padding: [90, 90], maxZoom: 15 });
  } else if (!zoneFilter && !currentSearch) {
    fitLodBounds();
  }
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
    `📥 ${report.total.label}: *${report.total.value}* (${report.kpis[0].value} נפתחו בנובמבר)\n` +
    `📍 חלוקה לפי אזור: ${zoneSplit}\n` +
    `🚗 עיקר התלונות: ${mainTypes}\n\n` +
    `🎯 *מוקדים בולטים לטיפול:*\n${hotspotLines}\n\n` +
    `📌 ${report.summary}\n\n` +
    `לצפייה בדשבורד: ${window.location.href}`;
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
}
