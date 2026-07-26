(function () {
  "use strict";

  var STORAGE_KEY = "chinaTripMap.itineraryOverrides.v1";

  // The prototype now has three coordinated layers:
  // 1. China overview (national routes + city markers)
  // 2. City overview (city-scoped landmarks + itinerary day navigation)
  // 3. Daily itinerary view (filtered stop markers + local day routes + editable statuses)
  var state = {
    map: null,
    cityLookup: new Map(),
    landmarkLookup: new Map(),
    dayLookup: new Map(),
    stopLookup: new Map(),
    routeLookup: new Map(),
    itineraryCityIds: new Set(),
    cityMarkers: new Map(),
    genericLandmarkMarkers: new Map(),
    dayStopMarkers: new Map(),
    cityLayerGroup: null,
    nationalRouteLayerGroup: null,
    genericLandmarkLayerGroup: null,
    dailyRouteLayerGroup: null,
    dailyStopLayerGroup: null,
    selectedCityId: null,
    selectedDayId: null,
    selectedLandmarkId: null,
    selectedStopId: null,
    viewportCityId: null,
    toolbarTitle: "China Overview",
    toolbarDescription: "Route lines, city zoom, and landmark markers built with Leaflet and structured itinerary data.",
    filters: createDefaultFilters(),
    edits: loadStoredEdits(),
    isMobileLayout: false
  };

  var mapElement = document.getElementById("map");
  var detailContentElement = document.getElementById("detail-content");
  var detailKickerElement = document.getElementById("detail-kicker");
  var selectionChipElement = document.getElementById("selection-chip");
  var heroMetricsElement = document.getElementById("hero-metrics");
  var timelineListElement = document.getElementById("timeline-list");
  var cityButtonListElement = document.getElementById("city-button-list");
  var itineraryDayListElement = document.getElementById("itinerary-day-list");
  var dayContextLabelElement = document.getElementById("day-context-label");
  var toolbarTitleElement = document.getElementById("toolbar-title");
  var toolbarDescriptionElement = document.getElementById("toolbar-description");
  var menuToggleElement = document.getElementById("menu-toggle");
  var sidebarScrimElement = document.getElementById("sidebar-scrim");
  var overviewButtonElement = document.getElementById("overview-button");
  var resetMapButtonElement = document.getElementById("reset-map-button");
  var resetFiltersButtonElement = document.getElementById("reset-filters-button");
  var resetSavedChangesButtonElement = document.getElementById("reset-saved-changes-button");
  var filterCityElement = document.getElementById("filter-city");
  var filterDateElement = document.getElementById("filter-date");
  var filterPriorityElement = document.getElementById("filter-priority");
  var filterReservationElement = document.getElementById("filter-reservation");
  var filterModeElement = document.getElementById("filter-mode");
  var filterCategoryElement = document.getElementById("filter-category");
  var filterBookedOnlyElement = document.getElementById("filter-booked-only");
  var filterMustSeeOnlyElement = document.getElementById("filter-must-see-only");
  var toggleAllCityLandmarksElement = document.getElementById("toggle-all-city-landmarks");

  var tripCities = Array.isArray(window.tripCities) ? window.tripCities : [];
  var tripRoutes = Array.isArray(window.tripRoutes) ? window.tripRoutes : [];
  var tripLandmarks = Array.isArray(window.tripLandmarks) ? window.tripLandmarks : [];
  var itineraryDays = Array.isArray(window.itineraryDays) ? window.itineraryDays : [];
  var itineraryStops = Array.isArray(window.itineraryStops) ? window.itineraryStops : [];
  var localRoutes = Array.isArray(window.localRoutes) ? window.localRoutes : [];
  var mobileLayoutQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 920px)")
    : null;
  var mapResizeDebounceId = 0;

  state.isMobileLayout = mobileLayoutQuery ? mobileLayoutQuery.matches : window.innerWidth <= 920;

  document.addEventListener("DOMContentLoaded", initializeApp);

  function initializeApp() {
    if (!validateDependencies()) {
      renderFatalError("Leaflet or one of the itinerary data files failed to load. Please refresh and check the console for details.");
      return;
    }

    buildLookups();
    renderHeroMetrics();
    renderTimeline();
    renderCityButtons();
    populateFilterControls();
    renderItineraryDayList();
    initializeMap();
    renderCityMarkers();
    renderNationalRouteLines();
    createGenericLandmarkMarkers();
    bindUiEvents();
    resetMap({ animate: false, preserveFilters: false });
    scheduleMapResize(0);
  }

  function validateDependencies() {
    return Boolean(
      window.L &&
      mapElement &&
      tripCities.length &&
      tripRoutes.length &&
      tripLandmarks.length &&
      itineraryDays.length &&
      itineraryStops.length &&
      localRoutes.length
    );
  }

  function renderFatalError(message) {
    if (detailKickerElement) {
      detailKickerElement.textContent = "Setup issue";
    }

    if (detailContentElement) {
      detailContentElement.innerHTML = [
        '<div class="info-callout">',
        "  <h2>Prototype could not initialize</h2>",
        "  <p>" + escapeHtml(message) + "</p>",
        "</div>"
      ].join("");
    }
  }

  function buildLookups() {
    tripCities.forEach(function (city) {
      state.cityLookup.set(city.id, city);
    });

    tripLandmarks.forEach(function (landmark) {
      state.landmarkLookup.set(landmark.id, landmark);
    });

    itineraryDays.forEach(function (day) {
      state.dayLookup.set(day.id, day);
      state.itineraryCityIds.add(day.cityId);
    });

    itineraryStops.forEach(function (stop) {
      state.stopLookup.set(stop.id, stop);
    });

    localRoutes.forEach(function (route) {
      state.routeLookup.set(route.id, route);
    });
  }

  function createDefaultFilters() {
    return {
      cityId: "all",
      date: "all",
      priority: "all",
      reservationStatus: "all",
      transportationMode: "all",
      category: "all",
      bookedOnly: false,
      mustSeeOnly: false,
      showAllCityLandmarks: false
    };
  }

  function loadStoredEdits() {
    var rawValue;

    try {
      rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        return { days: {}, stops: {} };
      }

      return Object.assign({ days: {}, stops: {} }, JSON.parse(rawValue));
    } catch (error) {
      window.console.warn("Could not load saved trip edits.", error);
      return { days: {}, stops: {} };
    }
  }

  function saveStoredEdits() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.edits));
    } catch (error) {
      window.console.warn("Could not save trip edits.", error);
    }
  }

  function renderHeroMetrics() {
    if (!heroMetricsElement) {
      return;
    }

    var today = stripTime(new Date());
    var tripStart = new Date("2026-08-10T00:00:00");
    var tripEnd = new Date("2026-08-26T00:00:00");
    var daysUntilStart = Math.ceil((tripStart.getTime() - today.getTime()) / 86400000);
    var tripSpanDays = Math.ceil((tripEnd.getTime() - tripStart.getTime()) / 86400000);
    var countdownLabel = daysUntilStart > 0 ? daysUntilStart + " days to go" : "Trip in progress";

    heroMetricsElement.innerHTML = [
      createMetricCard(countdownLabel, "Countdown from today"),
      createMetricCard(String(itineraryDays.length), "Detailed itinerary days"),
      createMetricCard(tripSpanDays + " travel days", "August 10 through August 26")
    ].join("");
  }

  function createMetricCard(value, label) {
    return [
      '<div class="metric-card">',
      "  <strong>" + escapeHtml(value) + "</strong>",
      "  <span>" + escapeHtml(label) + "</span>",
      "</div>"
    ].join("");
  }

  function renderTimeline() {
    if (!timelineListElement) {
      return;
    }

    var timelineEntries = [
      {
        date: "August 11, 2026",
        title: "Arrive in Shanghai",
        copy: "Land around 3:00 PM and ease into the first Shanghai stay."
      },
      {
        date: "August 12, 2026",
        title: "Shanghai to Jinan",
        copy: "Planning a high-speed train ride of about 4 hours."
      },
      {
        date: "August 15, 2026",
        title: "Jinan to Beijing",
        copy: "Planning a high-speed train leg of about 2 hours."
      },
      {
        date: "August 19, 2026",
        title: "Beijing to Yunnan",
        copy: "Domestic flight to a temporary Kunming-based Yunnan placeholder."
      },
      {
        date: "August 22, 2026",
        title: "Yunnan to Shanghai",
        copy: "Return flight to Shanghai for the final city stay."
      },
      {
        date: "August 26, 2026",
        title: "Shanghai to New York",
        copy: "International departure remains editable and is intentionally kept off the China overview map."
      }
    ];

    timelineListElement.innerHTML = timelineEntries.map(function (entry) {
      return [
        '<li class="timeline-item">',
        '  <span class="timeline-date">' + escapeHtml(entry.date) + "</span>",
        '  <strong class="timeline-title">' + escapeHtml(entry.title) + "</strong>",
        '  <p class="timeline-copy">' + escapeHtml(entry.copy) + "</p>",
        "</li>"
      ].join("");
    }).join("");
  }

  function renderCityButtons() {
    if (!cityButtonListElement) {
      return;
    }

    cityButtonListElement.innerHTML = getOrderedCities().map(function (city) {
      var sequenceLabel = city.sequence.join(" & ");
      var dayCount = getItineraryDaysForCity(city.id).length;
      var badgeLabel = city.isTemporary
        ? "Temporary"
        : dayCount
          ? dayCount + " itinerary day" + (dayCount > 1 ? "s" : "")
          : "No detailed days";
      var subtitle = city.subtitle ? city.subtitle : city.chineseName;

      return [
        '<button class="city-select-button" type="button" data-city-select="' + escapeHtml(city.id) + '">',
        '  <div class="city-button-topline">',
        '    <span class="sequence-badge">Stop ' + escapeHtml(sequenceLabel) + "</span>",
        '    <span class="city-badge">' + escapeHtml(badgeLabel) + "</span>",
        "  </div>",
        '  <strong class="city-button-name">' + escapeHtml(city.name) + "</strong>",
        '  <div class="city-button-meta"><span>' + escapeHtml(subtitle) + '</span><span>' + escapeHtml(getLandmarksForCity(city.id).length + " landmarks") + "</span></div>",
        "</button>"
      ].join("");
    }).join("");
  }

  function populateFilterControls() {
    populateCityFilterOptions();
    populateCategoryFilterOptions();
    populateTransportModeOptions();
    syncDateFilterOptions();
    syncFilterControls();
  }

  function populateCityFilterOptions() {
    if (!filterCityElement) {
      return;
    }

    filterCityElement.innerHTML = [
      '<option value="all">All cities</option>'
    ].concat(getOrderedCities().map(function (city) {
      return '<option value="' + escapeHtml(city.id) + '">' + escapeHtml(city.name) + "</option>";
    })).join("");
  }

  function populateCategoryFilterOptions() {
    if (!filterCategoryElement) {
      return;
    }

    var categories = Array.from(new Set(tripLandmarks.map(function (landmark) {
      return landmark.category;
    }).filter(Boolean))).sort();

    filterCategoryElement.innerHTML = [
      '<option value="all">All categories</option>'
    ].concat(categories.map(function (category) {
      return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + "</option>";
    })).join("");
  }

  function populateTransportModeOptions() {
    if (!filterModeElement) {
      return;
    }

    var modes = Array.from(new Set(
      itineraryStops.map(function (stop) {
        return stop.transportationMode;
      }).concat(localRoutes.map(function (route) {
        return route.mode;
      })).filter(Boolean)
    )).sort();

    filterModeElement.innerHTML = [
      '<option value="all">All transport modes</option>'
    ].concat(modes.map(function (mode) {
      return '<option value="' + escapeHtml(mode) + '">' + escapeHtml(formatModeLabel(mode)) + "</option>";
    })).join("");
  }

  function syncDateFilterOptions() {
    if (!filterDateElement) {
      return;
    }

    var scopedCityId = getEffectiveFilterCityId();
    var scopedDays = scopedCityId && scopedCityId !== "all"
      ? getItineraryDaysForCity(scopedCityId)
      : getSortedItineraryDays();
    var existingValue = state.filters.date;
    var validValues = new Set(["all"]);

    filterDateElement.innerHTML = [
      '<option value="all">All itinerary dates</option>'
    ].concat(scopedDays.map(function (day) {
      validValues.add(day.id);
      return '<option value="' + escapeHtml(day.id) + '">' + escapeHtml(formatDayFilterLabel(day)) + "</option>";
    })).join("");

    if (!validValues.has(existingValue)) {
      state.filters.date = "all";
    }

    filterDateElement.value = state.filters.date;
  }

  function syncFilterControls() {
    if (filterCityElement) {
      filterCityElement.value = state.filters.cityId;
    }
    if (filterPriorityElement) {
      filterPriorityElement.value = state.filters.priority;
    }
    if (filterReservationElement) {
      filterReservationElement.value = state.filters.reservationStatus;
    }
    if (filterModeElement) {
      filterModeElement.value = state.filters.transportationMode;
    }
    if (filterCategoryElement) {
      filterCategoryElement.value = state.filters.category;
    }
    if (filterBookedOnlyElement) {
      filterBookedOnlyElement.checked = state.filters.bookedOnly;
    }
    if (filterMustSeeOnlyElement) {
      filterMustSeeOnlyElement.checked = state.filters.mustSeeOnly;
    }
    if (toggleAllCityLandmarksElement) {
      toggleAllCityLandmarksElement.checked = state.filters.showAllCityLandmarks;
    }
    syncDateFilterOptions();
  }

  function renderItineraryDayList() {
    if (!itineraryDayListElement) {
      return;
    }

    var scopedCityId = getEffectiveFilterCityId();
    var scopedDays = scopedCityId && scopedCityId !== "all"
      ? getItineraryDaysForCity(scopedCityId)
      : getSortedItineraryDays();

    if (dayContextLabelElement) {
      dayContextLabelElement.textContent = scopedCityId && scopedCityId !== "all"
        ? state.cityLookup.get(scopedCityId).name
        : "Beijing & Shanghai";
    }

    if (!scopedDays.length) {
      itineraryDayListElement.innerHTML = [
        '<div class="empty-state-card">',
        "  <strong>No itinerary days here yet</strong>",
        "  <p>Select Beijing or Shanghai to explore the detailed day-by-day plans. Jinan and the temporary Yunnan stop still use the simpler city-overview mode.</p>",
        "</div>"
      ].join("");
      return;
    }

    itineraryDayListElement.innerHTML = scopedDays.map(function (day) {
      var city = state.cityLookup.get(day.cityId);
      var stopCount = getStopsForDay(day.id).length;
      var isActive = day.id === state.selectedDayId;

      return [
        '<button class="itinerary-day-card ' + (isActive ? "is-active" : "") + '" type="button" data-day-select="' + escapeHtml(day.id) + '">',
        '  <div class="day-card-topline">',
        '    <span class="mini-pill">' + escapeHtml(city.name) + "</span>",
        '    <span class="pace-pill pace-pill--' + escapeHtml(normalizeForCss(day.pace)) + '">' + escapeHtml(day.pace) + "</span>",
        "  </div>",
        '  <strong>' + escapeHtml(formatDate(day.date)) + "</strong>",
        '  <span class="day-card-title">' + escapeHtml(day.title) + "</span>",
        '  <div class="day-card-meta"><span>' + escapeHtml(day.expectedWalking) + "</span><span>" + escapeHtml(stopCount + " stops") + "</span></div>",
        "</button>"
      ].join("");
    }).join("");
  }

  function initializeMap() {
    state.map = window.L.map("map", {
      zoomControl: false,
      minZoom: 4,
      maxZoom: 16,
      worldCopyJump: false
    });

    window.L.control.zoom({ position: "bottomright" }).addTo(state.map);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);

    state.cityLayerGroup = window.L.layerGroup().addTo(state.map);
    state.nationalRouteLayerGroup = window.L.layerGroup().addTo(state.map);
    state.genericLandmarkLayerGroup = window.L.layerGroup().addTo(state.map);
    state.dailyRouteLayerGroup = window.L.layerGroup().addTo(state.map);
    state.dailyStopLayerGroup = window.L.layerGroup().addTo(state.map);

    state.map.on("zoomend moveend", handleViewportChange);
  }

  function renderCityMarkers() {
    getOrderedCities().forEach(function (city) {
      var marker = window.L.marker([city.latitude, city.longitude], {
        icon: createCityMarkerIcon(city),
        riseOnHover: true
      });

      marker.on("click", function () {
        selectCity(city.id);
      });

      marker.bindPopup(createCityPopupHtml(city));
      marker.addTo(state.cityLayerGroup);
      state.cityMarkers.set(city.id, marker);
    });
  }

  function createCityMarkerIcon(city) {
    var returnBadge = city.sequence.length > 1
      ? '<span class="city-marker__return">' + escapeHtml(String(city.sequence[city.sequence.length - 1])) + "</span>"
      : "";
    var html = [
      '<div class="city-marker">',
      '  <div class="city-marker__pin ' + (city.isTemporary ? "is-temporary" : "") + '">',
      '    <span class="city-marker__order">' + escapeHtml(String(city.sequence[0])) + "</span>",
           returnBadge,
      "  </div>",
      '  <div class="city-marker__label">',
      '    <strong>' + escapeHtml(city.name) + "</strong>",
      '    <span>' + escapeHtml(city.chineseName) + "</span>",
      "  </div>",
      "</div>"
    ].join("");

    return window.L.divIcon({
      className: "",
      html: html,
      iconSize: [140, 58],
      iconAnchor: [28, 50],
      popupAnchor: [8, -36]
    });
  }

  function createCityPopupHtml(city) {
    var sample = city.isTemporary ? "Temporary southwest stop" : "Click to open city details";
    return [
      '<div class="popup-card">',
      "  <strong>" + escapeHtml(city.name + " / " + city.chineseName) + "</strong>",
      "  <p>" + escapeHtml(sample) + "</p>",
      '  <button type="button" data-popup-city="' + escapeHtml(city.id) + '">Open city panel</button>',
      "</div>"
    ].join("");
  }

  function renderNationalRouteLines() {
    tripRoutes.forEach(function (route) {
      var points = buildNationalRoutePoints(route);
      var polyline = window.L.polyline(points, getNationalRouteStyle(route))
        .bindPopup(createNationalRoutePopupHtml(route))
        .addTo(state.nationalRouteLayerGroup);

      polyline.routeId = route.id;

      var arrowMarker = createDirectionalMarker(points, route.mode, route.status !== "Confirmed");
      if (arrowMarker) {
        arrowMarker.addTo(state.nationalRouteLayerGroup);
      }
    });
  }

  function buildNationalRoutePoints(route) {
    var fromCity = state.cityLookup.get(route.fromCityId);
    var toCity = state.cityLookup.get(route.toCityId);

    if (!fromCity || !toCity) {
      return [];
    }

    if (route.mode === "flight") {
      return buildCurvedPath([fromCity.latitude, fromCity.longitude], [toCity.latitude, toCity.longitude], 0.16);
    }

    return [
      [fromCity.latitude, fromCity.longitude],
      [toCity.latitude, toCity.longitude]
    ];
  }

  function getNationalRouteStyle(route) {
    var isPlanning = route.status !== "Confirmed";
    var fallbackColor = route.mode === "train" ? "#b95b34" : "#2f6f8f";
    var mutedColor = route.mode === "train" ? "#c28463" : "#6f92a6";

    return {
      color: isPlanning ? mutedColor : fallbackColor,
      weight: route.mode === "train" ? 5 : 4,
      opacity: isPlanning ? 0.72 : 0.95,
      dashArray: route.mode === "flight" ? "10 10" : null,
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function createNationalRoutePopupHtml(route) {
    var fromCity = state.cityLookup.get(route.fromCityId);
    var toCity = state.cityLookup.get(route.toCityId);
    return [
      '<div class="popup-card">',
      "  <strong>" + escapeHtml(fromCity.name + " to " + toCity.name) + "</strong>",
      "  <p>" + escapeHtml(route.label + " • " + formatDate(route.date) + " • " + route.estimatedDuration) + "</p>",
      "</div>"
    ].join("");
  }

  function createGenericLandmarkMarkers() {
    tripLandmarks.forEach(function (landmark) {
      if (!isFiniteNumber(landmark.latitude) || !isFiniteNumber(landmark.longitude)) {
        return;
      }

      var marker = window.L.marker([landmark.latitude, landmark.longitude], {
        icon: createGenericLandmarkIcon(landmark)
      });

      marker.on("click", function () {
        selectLandmark(landmark.id);
      });

      marker.bindPopup(createGenericLandmarkPopupHtml(landmark));
      state.genericLandmarkMarkers.set(landmark.id, marker);
    });
  }

  function createGenericLandmarkIcon(landmark) {
    var categoryClass = "is-" + normalizeForCss(landmark.category || "landmark");
    var shortCode = getCategoryCode(landmark.category);

    return window.L.divIcon({
      className: "",
      html: '<div class="landmark-marker ' + categoryClass + '">' + escapeHtml(shortCode) + "</div>",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -16]
    });
  }

  function createGenericLandmarkPopupHtml(landmark) {
    return [
      '<div class="popup-card">',
      "  <strong>" + escapeHtml(landmark.name + " / " + landmark.chineseName) + "</strong>",
      "  <p>" + escapeHtml(landmark.category + " • " + landmark.visitLength) + "</p>",
      '  <button type="button" data-popup-landmark="' + escapeHtml(landmark.id) + '">Open landmark details</button>',
      "</div>"
    ].join("");
  }

  function bindUiEvents() {
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("change", handleDocumentChange);
    document.addEventListener("input", handleDocumentInput);
    window.addEventListener("resize", handleViewportResize);

    if (mobileLayoutQuery) {
      if (typeof mobileLayoutQuery.addEventListener === "function") {
        mobileLayoutQuery.addEventListener("change", handleViewportResize);
      } else if (typeof mobileLayoutQuery.addListener === "function") {
        mobileLayoutQuery.addListener(handleViewportResize);
      }
    }

    if (menuToggleElement) {
      menuToggleElement.addEventListener("click", function () {
        toggleSidebar();
      });
    }

    if (sidebarScrimElement) {
      sidebarScrimElement.addEventListener("click", function () {
        toggleSidebar(false);
      });
    }

    if (overviewButtonElement) {
      overviewButtonElement.addEventListener("click", function () {
        resetMap({ animate: true, preserveFilters: true });
      });
    }

    if (resetMapButtonElement) {
      resetMapButtonElement.addEventListener("click", function () {
        resetMap({ animate: true, preserveFilters: true });
      });
    }

    if (resetFiltersButtonElement) {
      resetFiltersButtonElement.addEventListener("click", function () {
        resetAllFilters();
      });
    }

    if (resetSavedChangesButtonElement) {
      resetSavedChangesButtonElement.addEventListener("click", function () {
        resetStoredChanges();
      });
    }

    if (filterCityElement) {
      filterCityElement.addEventListener("change", function () {
        state.filters.cityId = filterCityElement.value;
        state.filters.date = "all";
        syncDateFilterOptions();

        if (state.filters.cityId === "all") {
          resetMap({ animate: true, preserveFilters: true });
        } else {
          selectCity(state.filters.cityId, { zoomToCity: true, syncFilter: false });
        }

        renderItineraryDayList();
      });
    }

    if (filterDateElement) {
      filterDateElement.addEventListener("change", function () {
        state.filters.date = filterDateElement.value;

        if (state.filters.date === "all") {
          if (state.selectedCityId) {
            selectCity(state.selectedCityId, { zoomToCity: false, syncFilter: false });
          } else {
            renderCurrentContext();
            updateContextMapLayers();
          }
        } else {
          selectDay(state.filters.date, { zoomToDay: true, syncFilter: false });
        }
      });
    }

    [
      filterPriorityElement,
      filterReservationElement,
      filterModeElement,
      filterCategoryElement,
      filterBookedOnlyElement,
      filterMustSeeOnlyElement,
      toggleAllCityLandmarksElement
    ].forEach(function (element) {
      if (!element) {
        return;
      }

      element.addEventListener("change", function () {
        state.filters.priority = filterPriorityElement ? filterPriorityElement.value : "all";
        state.filters.reservationStatus = filterReservationElement ? filterReservationElement.value : "all";
        state.filters.transportationMode = filterModeElement ? filterModeElement.value : "all";
        state.filters.category = filterCategoryElement ? filterCategoryElement.value : "all";
        state.filters.bookedOnly = filterBookedOnlyElement ? filterBookedOnlyElement.checked : false;
        state.filters.mustSeeOnly = filterMustSeeOnlyElement ? filterMustSeeOnlyElement.checked : false;
        state.filters.showAllCityLandmarks = toggleAllCityLandmarksElement ? toggleAllCityLandmarksElement.checked : false;
        renderCurrentContext();
        updateContextMapLayers();
        renderItineraryDayList();
      });
    });
  }

  function handleDocumentClick(event) {
    var cityButton = event.target.closest("[data-city-select]");
    var dayButton = event.target.closest("[data-day-select]");
    var popupCityButton = event.target.closest("[data-popup-city]");
    var popupLandmarkButton = event.target.closest("[data-popup-landmark]");
    var popupStopButton = event.target.closest("[data-popup-stop]");
    var stopCardButton = event.target.closest("[data-stop-select]");
    var backToCityButton = event.target.closest("[data-back-city]");
    var backToDayButton = event.target.closest("[data-back-day]");
    var overviewReturnButton = event.target.closest("[data-return-overview]");
    var landmarkJumpButton = event.target.closest("[data-landmark-jump]");
    var placeholderActionButton = event.target.closest("[data-action]");

    if (cityButton) {
      selectCity(cityButton.getAttribute("data-city-select"));
      return;
    }

    if (dayButton) {
      selectDay(dayButton.getAttribute("data-day-select"));
      return;
    }

    if (popupCityButton) {
      selectCity(popupCityButton.getAttribute("data-popup-city"));
      state.map.closePopup();
      return;
    }

    if (popupLandmarkButton) {
      selectLandmark(popupLandmarkButton.getAttribute("data-popup-landmark"));
      state.map.closePopup();
      return;
    }

    if (popupStopButton) {
      selectStop(popupStopButton.getAttribute("data-popup-stop"), true);
      state.map.closePopup();
      return;
    }

    if (stopCardButton) {
      selectStop(stopCardButton.getAttribute("data-stop-select"), false);
      return;
    }

    if (backToCityButton) {
      state.selectedLandmarkId = null;
      selectCity(backToCityButton.getAttribute("data-back-city"), { zoomToCity: false, syncFilter: false });
      return;
    }

    if (backToDayButton) {
      state.selectedLandmarkId = null;
      state.selectedStopId = backToDayButton.getAttribute("data-back-stop") || state.selectedStopId;
      selectDay(backToDayButton.getAttribute("data-back-day"), { zoomToDay: false, syncFilter: false });
      return;
    }

    if (overviewReturnButton) {
      resetMap({ animate: true, preserveFilters: true });
      return;
    }

    if (landmarkJumpButton) {
      var stopId = landmarkJumpButton.getAttribute("data-stop-id");
      if (stopId) {
        selectStop(stopId, true);
      } else {
        selectLandmark(landmarkJumpButton.getAttribute("data-landmark-jump"));
      }
      return;
    }

    if (placeholderActionButton) {
      handlePlaceholderAction(placeholderActionButton);
    }
  }

  function handleDocumentChange(event) {
    var target = event.target;

    if (target.matches("[data-day-status]")) {
      updateDayEdit(target.getAttribute("data-day-status"), "status", target.value);
      renderCurrentContext();
      renderItineraryDayList();
      return;
    }

    if (target.matches("[data-stop-priority]")) {
      updateStopEdit(target.getAttribute("data-stop-priority"), "priority", target.value);
      renderCurrentContext();
      updateContextMapLayers();
      return;
    }

    if (target.matches("[data-stop-reservation]")) {
      updateStopEdit(target.getAttribute("data-stop-reservation"), "reservationStatus", target.value);
      renderCurrentContext();
      updateContextMapLayers();
    }
  }

  function handleDocumentInput(event) {
    var target = event.target;

    if (target.matches("[data-day-notes]")) {
      updateDayEdit(target.getAttribute("data-day-notes"), "notes", target.value);
      return;
    }

    if (target.matches("[data-stop-notes]")) {
      updateStopEdit(target.getAttribute("data-stop-notes"), "notes", target.value);
    }
  }

  function scheduleMapResize(delay) {
    window.clearTimeout(mapResizeDebounceId);

    mapResizeDebounceId = window.setTimeout(function () {
      if (!state.map) {
        return;
      }

      state.map.invalidateSize();
    }, typeof delay === "number" ? delay : 120);
  }

  function handleViewportResize() {
    var isMobileLayout = mobileLayoutQuery ? mobileLayoutQuery.matches : window.innerWidth <= 920;
    var delay = 120;

    if (isMobileLayout !== state.isMobileLayout) {
      state.isMobileLayout = isMobileLayout;
      delay = 180;
    }

    scheduleMapResize(delay);
  }

  function updateDayEdit(dayId, field, value) {
    state.edits.days[dayId] = Object.assign({}, state.edits.days[dayId], {
      [field]: value
    });
    saveStoredEdits();
  }

  function updateStopEdit(stopId, field, value) {
    state.edits.stops[stopId] = Object.assign({}, state.edits.stops[stopId], {
      [field]: value
    });
    saveStoredEdits();
  }

  function resetStoredChanges() {
    var confirmed = window.confirm("Reset all saved trip changes on this device? This will clear edited statuses and notes.");

    if (!confirmed) {
      return;
    }

    state.edits = { days: {}, stops: {} };
    saveStoredEdits();
    renderCurrentContext();
    renderItineraryDayList();
    updateContextMapLayers();
  }

  function resetAllFilters() {
    state.filters = createDefaultFilters();
    syncFilterControls();
    renderItineraryDayList();

    if (state.selectedDayId) {
      selectDay(state.selectedDayId, { zoomToDay: false, syncFilter: false });
      return;
    }

    if (state.selectedCityId) {
      selectCity(state.selectedCityId, { zoomToCity: false, syncFilter: false });
      return;
    }

    renderCurrentContext();
    updateContextMapLayers();
  }

  function selectCity(cityId, options) {
    var city = state.cityLookup.get(cityId);
    var settings = options || {};

    if (!city || !state.map) {
      return;
    }

    state.selectedCityId = cityId;
    state.selectedDayId = null;
    state.selectedStopId = null;
    state.selectedLandmarkId = null;
    state.viewportCityId = null;

    if (settings.syncFilter !== false) {
      state.filters.cityId = cityId;
      state.filters.date = "all";
      syncFilterControls();
    } else {
      syncDateFilterOptions();
    }

    renderItineraryDayList();
    renderCurrentContext();
    updateToolbar(city.name, "City overview, planned landmarks, and clickable day-by-day itinerary cards.");
    updateSelectionChip(city.name);
    updateCityButtonState();
    updateContextMapLayers();

    if (settings.zoomToCity !== false) {
      state.map.flyToBounds(city.detailBounds, {
        padding: [40, 40],
        duration: 1.15
      });
    }

    toggleSidebar(false);
  }

  function selectDay(dayId, options) {
    var day = state.dayLookup.get(dayId);
    var settings = options || {};

    if (!day) {
      return;
    }

    state.selectedCityId = day.cityId;
    state.selectedDayId = dayId;
    state.selectedLandmarkId = null;
    state.selectedStopId = settings.focusStopId || state.selectedStopId || null;
    state.viewportCityId = null;

    if (settings.syncFilter !== false) {
      state.filters.cityId = day.cityId;
      state.filters.date = day.id;
      syncFilterControls();
    } else {
      syncDateFilterOptions();
    }

    renderItineraryDayList();
    renderCurrentContext();
    updateToolbar(formatDate(day.date), day.title + " • " + day.routeSummary);
    updateSelectionChip(formatDate(day.date));
    updateCityButtonState();
    updateContextMapLayers();

    if (settings.zoomToDay !== false) {
      fitBoundsToSelectedDay(day.id);
    }

    if (state.selectedStopId) {
      scrollStopCardIntoView(state.selectedStopId);
    }

    toggleSidebar(false);
  }

  function selectLandmark(landmarkId) {
    var landmark = state.landmarkLookup.get(landmarkId);
    var city;

    if (!landmark) {
      return;
    }

    city = state.cityLookup.get(landmark.cityId) || state.cityLookup.get(state.selectedCityId);

    state.selectedLandmarkId = landmarkId;
    state.selectedStopId = null;

    if (city && !state.selectedCityId) {
      state.selectedCityId = city.id;
    }

    renderCurrentContext();
    updateToolbar(landmark.name, "Landmark details, reservation notes, and itinerary context.");
    updateSelectionChip(landmark.name);
    updateContextMapLayers();

    if (isFiniteNumber(landmark.latitude) && isFiniteNumber(landmark.longitude)) {
      state.map.flyTo([landmark.latitude, landmark.longitude], Math.max(getCityDetailZoom(city), 12), {
        duration: 0.9
      });
    }
  }

  function selectStop(stopId, shouldScroll) {
    var stop = state.stopLookup.get(stopId);

    if (!stop) {
      return;
    }

    if (state.selectedDayId !== stop.dayId) {
      selectDay(stop.dayId, { zoomToDay: false, syncFilter: false, focusStopId: stopId });
      return;
    }

    state.selectedStopId = stopId;
    state.selectedLandmarkId = null;
    renderCurrentContext();
    updateContextMapLayers();

    if (shouldScroll) {
      scrollStopCardIntoView(stopId);
    }
  }

  function scrollStopCardIntoView(stopId) {
    window.requestAnimationFrame(function () {
      var stopCard = detailContentElement.querySelector('[data-stop-card-id="' + CSS.escape(stopId) + '"]');
      if (stopCard) {
        stopCard.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  function resetMap(options) {
    var settings = options || {};
    var overviewBounds = window.L.latLngBounds(tripCities.map(function (city) {
      return [city.latitude, city.longitude];
    }));

    state.selectedCityId = null;
    state.selectedDayId = null;
    state.selectedLandmarkId = null;
    state.selectedStopId = null;
    state.viewportCityId = null;

    if (settings.preserveFilters === false) {
      state.filters = createDefaultFilters();
      syncFilterControls();
    } else {
      state.filters.cityId = "all";
      state.filters.date = "all";
      syncDateFilterOptions();
      if (filterCityElement) {
        filterCityElement.value = "all";
      }
    }

    renderItineraryDayList();
    renderCurrentContext();
    updateToolbar("China Overview", "Switch between the national route, city overviews, and the new Beijing / Shanghai daily itinerary layers.");
    updateSelectionChip("China overview");
    updateCityButtonState();
    updateContextMapLayers();

    if (!state.map) {
      return;
    }

    if (settings.animate === false) {
      state.map.fitBounds(overviewBounds.pad(0.55), { padding: [36, 36] });
    } else {
      state.map.flyToBounds(overviewBounds.pad(0.55), {
        padding: [36, 36],
        duration: 1.2
      });
    }
  }

  function handleViewportChange() {
    if (!state.map || state.selectedCityId || state.selectedDayId || state.selectedLandmarkId) {
      return;
    }

    var city = getViewportCity();

    if (city) {
      if (state.viewportCityId !== city.id) {
        state.viewportCityId = city.id;
        renderCurrentContext();
        updateToolbar(city.name, "Viewport preview of the city overview. Click the city stop or itinerary day to lock in the selection.");
        updateSelectionChip(city.name + " (viewport)");
        updateContextMapLayers();
      }
    } else if (state.viewportCityId !== null) {
      state.viewportCityId = null;
      renderCurrentContext();
      updateToolbar("China Overview", "Switch between the national route, city overviews, and the new Beijing / Shanghai daily itinerary layers.");
      updateSelectionChip("China overview");
      updateContextMapLayers();
    }
  }

  function getViewportCity() {
    if (!state.map || state.map.getZoom() < 9) {
      return null;
    }

    var center = state.map.getCenter();
    return getOrderedCities().find(function (city) {
      return window.L.latLngBounds(city.detailBounds).pad(0.12).contains(center);
    }) || null;
  }

  function updateContextMapLayers() {
    updateGenericLandmarkVisibility();
    updateDailyItineraryMap();
  }

  function updateGenericLandmarkVisibility() {
    var visibleLandmarks = [];
    var cityId = getActiveLandmarkCityId();

    state.genericLandmarkLayerGroup.clearLayers();

    if (!cityId) {
      return;
    }

    visibleLandmarks = getLandmarksForCity(cityId);

    if (state.selectedDayId && !state.filters.showAllCityLandmarks) {
      return;
    }

    if (state.selectedDayId) {
      var dayStopLandmarkIds = new Set(getHydratedStopsForDay(state.selectedDayId).map(function (stop) {
        return stop.landmarkId;
      }).filter(Boolean));

      visibleLandmarks = visibleLandmarks.filter(function (landmark) {
        return !dayStopLandmarkIds.has(landmark.id);
      });
    }

    visibleLandmarks.forEach(function (landmark) {
      var marker = state.genericLandmarkMarkers.get(landmark.id);
      if (marker) {
        marker.addTo(state.genericLandmarkLayerGroup);
      }
    });
  }

  function getActiveLandmarkCityId() {
    if (state.selectedCityId && !state.selectedDayId) {
      return state.selectedCityId;
    }

    if (state.selectedDayId) {
      return state.selectedCityId;
    }

    if (state.viewportCityId) {
      return state.viewportCityId;
    }

    return null;
  }

  function updateDailyItineraryMap() {
    state.dailyRouteLayerGroup.clearLayers();
    state.dailyStopLayerGroup.clearLayers();

    if (!state.selectedDayId) {
      return;
    }

    var visibleStops = getFilteredStopsForDay(state.selectedDayId);
    var visibleRoutes = getVisibleLocalRoutes(state.selectedDayId, visibleStops);

    visibleStops.forEach(function (stop) {
      if (!isFiniteNumber(stop.latitude) || !isFiniteNumber(stop.longitude)) {
        return;
      }

      var marker = window.L.marker([stop.latitude, stop.longitude], {
        icon: createDayStopIcon(stop, stop.id === state.selectedStopId)
      });

      marker.on("click", function () {
        selectStop(stop.id, true);
      });

      marker.bindPopup(createStopPopupHtml(stop));
      marker.addTo(state.dailyStopLayerGroup);
      state.dayStopMarkers.set(stop.id, marker);
    });

    visibleRoutes.forEach(function (route) {
      if (!route.points.length) {
        return;
      }

      var polyline = window.L.polyline(route.points, getLocalRouteStyle(route))
        .bindPopup(createLocalRoutePopupHtml(route))
        .addTo(state.dailyRouteLayerGroup);

      polyline.routeId = route.id;

      var arrowMarker = createDirectionalMarker(route.points, route.mode, route.routeStatus !== "Confirmed");
      if (arrowMarker) {
        arrowMarker.addTo(state.dailyRouteLayerGroup);
      }
    });
  }

  function fitBoundsToSelectedDay(dayId) {
    var city = state.cityLookup.get(state.dayLookup.get(dayId).cityId);
    var dayStops = getFilteredStopsForDay(dayId);
    var coords = dayStops.filter(function (stop) {
      return isFiniteNumber(stop.latitude) && isFiniteNumber(stop.longitude);
    }).map(function (stop) {
      return [stop.latitude, stop.longitude];
    });

    if (!coords.length && city) {
      state.map.flyToBounds(city.detailBounds, {
        padding: [40, 40],
        duration: 1.05
      });
      return;
    }

    state.map.flyToBounds(window.L.latLngBounds(coords).pad(0.22), {
      padding: [40, 40],
      duration: 1.05
    });
  }

  function createDayStopIcon(stop, isSelected) {
    var typeClass = "stop-marker--" + normalizeForCss(stop.type || "stop");
    var selectedClass = isSelected ? "is-selected" : "";

    return window.L.divIcon({
      className: "",
      html: [
        '<div class="stop-marker ' + typeClass + " " + selectedClass + '">',
        '  <span class="stop-marker__order">' + escapeHtml(String(stop.order)) + "</span>",
        "</div>"
      ].join(""),
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16]
    });
  }

  function createStopPopupHtml(stop) {
    return [
      '<div class="popup-card">',
      "  <strong>" + escapeHtml(stop.title) + "</strong>",
      "  <p>" + escapeHtml(formatTimeRange(stop.startTime, stop.endTime) + " • " + formatModeLabel(stop.transportationMode)) + "</p>",
      '  <button type="button" data-popup-stop="' + escapeHtml(stop.id) + '">Open stop card</button>',
      "</div>"
    ].join("");
  }

  function createLocalRoutePopupHtml(route) {
    return [
      '<div class="popup-card">',
      "  <strong>" + escapeHtml(route.modeLabel) + "</strong>",
      "  <p>" + escapeHtml((route.distance || "Distance pending") + " • " + (route.estimatedDuration || "Timing pending")) + "</p>",
      '  <p>' + escapeHtml(route.routeStatus) + "</p>",
      "</div>"
    ].join("");
  }

  function getLocalRouteStyle(route) {
    var styles = {
      walk: { color: "#2f7567", weight: 4, dashArray: "2 10" },
      subway: { color: "#2f6f8f", weight: 4, dashArray: null },
      taxi: { color: "#bf6b59", weight: 4, dashArray: "12 10" },
      "private-car": { color: "#6c4e8e", weight: 6, dashArray: null },
      train: { color: "#b95b34", weight: 5, dashArray: null },
      flight: { color: "#4f84a3", weight: 4, dashArray: "10 10" },
      boat: { color: "#2a7895", weight: 4, dashArray: null },
      shuttle: { color: "#708796", weight: 4, dashArray: "6 8" },
      chairlift: { color: "#9a7d4f", weight: 4, dashArray: "4 8" },
      toboggan: { color: "#7f5f9e", weight: 4, dashArray: "8 8" },
      flexible: { color: "#8a97a1", weight: 4, dashArray: "5 10" },
      meal: { color: "#8a97a1", weight: 3, dashArray: "2 8" },
      hotel: { color: "#6f7d86", weight: 3, dashArray: "2 8" },
      indoor: { color: "#5a7d8c", weight: 3, dashArray: "2 6" }
    };
    var baseStyle = styles[route.mode] || styles.flexible;

    return {
      color: baseStyle.color,
      weight: baseStyle.weight,
      opacity: 0.88,
      dashArray: baseStyle.dashArray,
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function createDirectionalMarker(points, mode, muted) {
    if (!points || points.length < 2) {
      return null;
    }

    var midIndex = Math.floor(points.length / 2);
    var previousPoint = points[Math.max(0, midIndex - 1)];
    var nextPoint = points[Math.min(points.length - 1, midIndex + 1)];
    var rotation = calculateBearing(previousPoint, nextPoint);
    var modeClass = normalizeForCss(mode || "route");
    var symbol = getRouteMarkerSymbol(mode);

    return window.L.marker(points[midIndex], {
      interactive: false,
      icon: window.L.divIcon({
        className: "route-arrow-icon",
        html: '<span class="route-arrow-symbol route-arrow-symbol--' + modeClass + " " + (muted ? "is-muted" : "") + '" style="transform: rotate(' + rotation + 'deg)">' + symbol + "</span>",
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      })
    });
  }

  function calculateBearing(fromPoint, toPoint) {
    var lat1 = toRadians(fromPoint[0]);
    var lat2 = toRadians(toPoint[0]);
    var deltaLng = toRadians(toPoint[1] - fromPoint[1]);
    var y = Math.sin(deltaLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - (Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng));
    return Math.atan2(y, x) * (180 / Math.PI);
  }

  function renderCurrentContext() {
    updateCityButtonState();
    updateDayButtonState();

    if (state.selectedLandmarkId) {
      var activeLandmark = state.landmarkLookup.get(state.selectedLandmarkId);
      if (activeLandmark) {
        renderLandmarkDetails(activeLandmark);
        return;
      }
    }

    if (state.selectedDayId) {
      renderDayDetails(state.dayLookup.get(state.selectedDayId));
      return;
    }

    if (state.selectedCityId) {
      renderCityDetails(state.cityLookup.get(state.selectedCityId), false);
      return;
    }

    if (state.viewportCityId) {
      renderCityDetails(state.cityLookup.get(state.viewportCityId), true);
      return;
    }

    renderOverviewDetails();
  }

  function renderOverviewDetails() {
    if (!detailContentElement || !detailKickerElement) {
      return;
    }

    detailKickerElement.textContent = "Trip snapshot";

    detailContentElement.innerHTML = [
      '<section class="detail-section">',
      '  <div class="detail-header">',
      "    <h2>China overview</h2>",
      '    <p class="detail-subtitle">Start with the national route, then move into city overviews or the new day-by-day Beijing and Shanghai itinerary layers.</p>',
      "  </div>",
      '  <div class="summary-grid">',
           createSummaryCard("5", "Trip steps including the Shanghai return"),
           createSummaryCard(String(itineraryDays.length), "Detailed itinerary days"),
           createSummaryCard(String(tripRoutes.length), "Intercity travel legs"),
      "  </div>",
      '  <div class="detail-columns">',
      '    <div class="info-callout">',
      "      <h3>What changed in this version</h3>",
      '      <p class="detail-copy">Beijing and Shanghai now have structured itinerary days, stop-by-stop local routing, editable reservation tracking, and filters that can hide or isolate specific parts of a day.</p>',
      "    </div>",
      '    <div class="info-callout">',
      "      <h3>What still uses the lighter mode</h3>",
      '      <p class="detail-copy">Jinan and the temporary Yunnan stop still use the simpler city-overview experience. That keeps the daily-logic architecture focused on the cities that already have detailed plans.</p>',
      "    </div>",
      "  </div>",
      '  <div class="detail-card-title"><h3>Current travel legs</h3><span class="status-pill">Planning</span></div>',
      '  <div class="detail-grid">' + tripRoutes.map(function (route) {
        var fromCity = state.cityLookup.get(route.fromCityId);
        var toCity = state.cityLookup.get(route.toCityId);
        return [
          '<div class="transport-card">',
          "  <strong>" + escapeHtml(fromCity.name + " to " + toCity.name) + "</strong>",
          '  <p class="route-copy">' + escapeHtml(route.label + " • " + formatDate(route.date)) + "</p>",
          '  <p class="route-copy">' + escapeHtml(route.estimatedDuration) + "</p>",
          "</div>"
        ].join("");
      }).join("") + "</div>",
      "</section>"
    ].join("");
  }

  function renderCityDetails(city, isViewportPreview) {
    if (!city) {
      renderOverviewDetails();
      return;
    }

    if (!detailContentElement || !detailKickerElement) {
      return;
    }

    var days = getItineraryDaysForCity(city.id);
    var inboundRoutes = tripRoutes.filter(function (route) {
      return route.toCityId === city.id;
    });
    var outboundRoutes = tripRoutes.filter(function (route) {
      return route.fromCityId === city.id;
    });
    var landmarks = getLandmarksForCity(city.id);
    var titleSuffix = isViewportPreview ? " • viewport preview" : "";

    detailKickerElement.textContent = isViewportPreview ? "Viewport preview" : "City overview";

    detailContentElement.innerHTML = [
      '<section class="detail-section">',
      '  <div class="detail-header">',
      "    <div>",
      "      <h2>" + escapeHtml(city.name) + "</h2>",
      '      <p class="detail-subtitle">' + escapeHtml(city.chineseName + (city.subtitle ? " • " + city.subtitle : "") + titleSuffix) + "</p>",
      "    </div>",
      '    <div class="detail-sequences">' + city.sequence.map(function (sequenceNumber) {
        return '<span class="sequence-badge">Stop ' + escapeHtml(String(sequenceNumber)) + "</span>";
      }).join("") + "</div>",
      "  </div>",
      '  <p class="detail-copy">' + escapeHtml(city.description) + "</p>",
      city.isTemporary
        ? '<div class="info-callout"><h3>Temporary content note</h3><p class="detail-copy">Kunming is still the stand-in for the Yunnan leg. Update the city object, local day data, and linked routes later if Guilin, Dali, Lijiang, or another destination replaces it.</p></div>'
        : "",
      days.length
        ? renderCityItinerarySection(city, days)
        : '<div class="info-callout"><h3>No day-by-day layer yet</h3><p class="detail-copy">This city still uses the lighter overview mode. The new itinerary architecture is currently focused on Beijing and Shanghai.</p></div>',
      '  <div class="detail-columns">',
      '    <div>',
      '      <div class="detail-card-title"><h3>Stays</h3><span class="mini-pill">' + escapeHtml(city.stays.length + " segment" + (city.stays.length > 1 ? "s" : "")) + "</span></div>",
      '      <div class="detail-grid">' + city.stays.map(function (stay) {
        return [
          '<div class="stay-card">',
          "  <strong>" + escapeHtml(stay.label) + "</strong>",
          '  <p class="detail-meta">' + escapeHtml(formatDate(stay.arrivalDate) + (stay.arrivalTime ? " • " + stay.arrivalTime : "")) + "</p>",
          '  <p class="detail-copy">' + escapeHtml("Departure: " + formatDate(stay.departureDate)) + "</p>",
          '  <p class="detail-copy">' + escapeHtml(stay.departureNote) + "</p>",
          "</div>"
        ].join("");
      }).join("") + "</div>",
      "    </div>",
      '    <div>',
      '      <div class="detail-card-title"><h3>Transportation</h3><span class="status-pill">Planning</span></div>',
      '      <div class="detail-grid">' + renderTransportCards(inboundRoutes, outboundRoutes, city.specialSegments) + "</div>",
      "    </div>",
      "  </div>",
      '  <div class="detail-card-title"><h3>City landmarks</h3><span class="mini-pill">' + escapeHtml(String(landmarks.length)) + " total</span></div>",
      '  <div class="landmark-button-list">' + landmarks.map(function (landmark) {
        var matchingDayStop = findStopForLandmarkInSelectedCity(landmark.id, city.id);
        return [
          '<button class="landmark-jump" type="button" ' + (matchingDayStop ? 'data-stop-id="' + escapeHtml(matchingDayStop.id) + '"' : 'data-landmark-jump="' + escapeHtml(landmark.id) + '"') + '>',
          "  <strong>" + escapeHtml(landmark.name) + " / " + escapeHtml(landmark.chineseName) + "</strong>",
          "  <small>" + escapeHtml(landmark.category + " • " + landmark.visitLength) + "</small>",
          "</button>"
        ].join("");
      }).join("") + "</div>",
      '  <div class="action-row">',
      '    <button class="detail-link-button" type="button" data-return-overview="true">Return to China Overview</button>',
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderCityItinerarySection(city, days) {
    return [
      '<div class="detail-card-title"><h3>Itinerary days</h3><span class="mini-pill">' + escapeHtml(String(days.length)) + " planned</span></div>",
      '<div class="city-itinerary-grid">',
      days.map(function (day) {
        var stopCount = getStopsForDay(day.id).length;
        return [
          '<button class="itinerary-preview-card" type="button" data-day-select="' + escapeHtml(day.id) + '">',
          '  <div class="day-card-topline">',
          '    <span class="mini-pill">' + escapeHtml(formatDate(day.date)) + "</span>",
          '    <span class="pace-pill pace-pill--' + escapeHtml(normalizeForCss(day.pace)) + '">' + escapeHtml(day.pace) + "</span>",
          "  </div>",
          '  <strong>' + escapeHtml(day.title) + "</strong>",
          '  <p class="detail-copy">' + escapeHtml(day.routeSummary) + "</p>",
          '  <div class="day-card-meta"><span>' + escapeHtml(day.expectedWalking) + "</span><span>" + escapeHtml(stopCount + " stops") + "</span></div>",
          "</button>"
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderTransportCards(inboundRoutes, outboundRoutes, specialSegments) {
    var cards = [];

    inboundRoutes.forEach(function (route) {
      var fromCity = state.cityLookup.get(route.fromCityId);
      cards.push(createTransportCard("Arriving from " + fromCity.name, route.label + " • " + formatDate(route.date), route.estimatedDuration + " • " + route.status));
    });

    outboundRoutes.forEach(function (route) {
      var toCity = state.cityLookup.get(route.toCityId);
      cards.push(createTransportCard("Departing to " + toCity.name, route.label + " • " + formatDate(route.date), route.estimatedDuration + " • " + route.status));
    });

    (specialSegments || []).forEach(function (segment) {
      cards.push(createTransportCard(segment.label, formatDate(segment.date) + " • " + segment.estimatedDuration, segment.note || segment.status));
    });

    return cards.join("");
  }

  function createTransportCard(title, lineOne, lineTwo) {
    return [
      '<div class="transport-card">',
      "  <strong>" + escapeHtml(title) + "</strong>",
      '  <p class="route-copy">' + escapeHtml(lineOne) + "</p>",
      '  <p class="route-copy">' + escapeHtml(lineTwo) + "</p>",
      "</div>"
    ].join("");
  }

  function renderDayDetails(day) {
    if (!day || !detailContentElement || !detailKickerElement) {
      return;
    }

    var city = state.cityLookup.get(day.cityId);
    var hydratedStops = getHydratedStopsForDay(day.id);
    var visibleStops = getFilteredStopsForDay(day.id);
    var visibleRoutes = getVisibleLocalRoutes(day.id, visibleStops);
    var summary = calculateDailySummary(day, visibleStops, visibleRoutes);
    var dayStatus = getDayStatus(day.id, day.status);
    var dayNotes = getDayNotes(day.id);
    var filterSummary = describeActiveFilters();

    detailKickerElement.textContent = "Daily itinerary";

    detailContentElement.innerHTML = [
      '<section class="detail-section">',
      renderDaySwitcher(city.id, day.id),
      '  <div class="detail-header">',
      "    <div>",
      "      <h2>" + escapeHtml(day.title) + "</h2>",
      '      <p class="detail-subtitle">' + escapeHtml(formatDate(day.date) + " • " + city.name + " • " + day.routeSummary) + "</p>",
      "    </div>",
      '    <div class="detail-chip-list">',
      '      <span class="pace-pill pace-pill--' + escapeHtml(normalizeForCss(day.pace)) + '">' + escapeHtml(day.pace) + "</span>",
      '      <span class="status-pill">' + escapeHtml(dayStatus) + "</span>",
      "    </div>",
      "  </div>",
      '  <div class="summary-grid">',
           createSummaryCard(String(summary.attractions), "Attractions"),
           createSummaryCard(String(summary.transfers), "Transfers"),
           createSummaryCard(String(summary.reservationsNeeded), "Reservations needed"),
           createSummaryCard(summary.walking, "Expected walking"),
           createSummaryCard(summary.earliestStart, "Earliest start"),
           createSummaryCard(summary.latestFinish, "Latest activity"),
           createSummaryCard(String(summary.mustSeeCount), "Must-see stops"),
      "  </div>",
      renderDayRuleCards(day),
      '  <div class="detail-edit-grid">',
      '    <label class="field-stack">',
      "      <span>Day status</span>",
      '      <select data-day-status="' + escapeHtml(day.id) + '">',
             createSelectOptions(["Planned", "Booked", "Confirmed"], dayStatus),
      "      </select>",
      "    </label>",
      '    <label class="field-stack field-stack--wide">',
      "      <span>Personal notes</span>",
      '      <textarea data-day-notes="' + escapeHtml(day.id) + '" rows="3" placeholder="Add your own notes for this day...">' + escapeHtml(dayNotes) + "</textarea>",
      "    </label>",
      "  </div>",
      '  <div class="filter-summary-card">',
      "    <strong>Filter status</strong>",
      '    <p>' + escapeHtml(filterSummary) + "</p>",
      '    <p class="detail-copy">' + escapeHtml(visibleStops.length + " of " + hydratedStops.length + " stops are currently visible in the day view.") + "</p>",
      "  </div>",
      '  <div class="detail-list-block">',
      "    <strong>Day notes</strong>",
      '    <ul class="detail-list">' + day.notes.map(function (note) {
        return "<li>" + escapeHtml(note) + "</li>";
      }).join("") + "</ul>",
      "  </div>",
      '  <div class="detail-link-row">',
      '    <button class="detail-link-button" type="button" data-back-city="' + escapeHtml(city.id) + '">Back to City Overview</button>',
      '    <button class="detail-link-button" type="button" data-return-overview="true">Return to China Overview</button>',
      "  </div>",
      '  <div class="detail-card-title"><h3>Stop timeline</h3><span class="mini-pill">' + escapeHtml(visibleStops.length + " visible") + "</span></div>",
           visibleStops.length
             ? renderStopTimeline(day.id, visibleStops, visibleRoutes)
             : '<div class="empty-state-card"><strong>No stops match the current filters</strong><p>Try resetting the date or stop filters to bring the full itinerary back into view.</p></div>',
      "</section>"
    ].join("");

    attachOptionalImageHandlers();
  }

  function renderDaySwitcher(cityId, activeDayId) {
    return [
      '<div class="day-switcher">',
      getItineraryDaysForCity(cityId).map(function (day) {
        return '<button class="day-switcher__button ' + (day.id === activeDayId ? "is-active" : "") + '" type="button" data-day-select="' + escapeHtml(day.id) + '">' + escapeHtml(formatShortDate(day.date)) + "</button>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderDayRuleCards(day) {
    var cards = [];

    if (day.importantRule) {
      cards.push([
        '<div class="info-callout">',
        "  <h3>Important rule</h3>",
        '  <p class="detail-copy">' + escapeHtml(day.importantRule) + "</p>",
        "</div>"
      ].join(""));
    }

    if (day.delayRule) {
      cards.push([
        '<div class="info-callout">',
        "  <h3>Delay rule</h3>",
        '  <p class="detail-copy">' + escapeHtml(day.delayRule) + "</p>",
        "</div>"
      ].join(""));
    }

    if (!cards.length) {
      return "";
    }

    return '<div class="detail-columns">' + cards.join("") + "</div>";
  }

  function renderStopTimeline(dayId, visibleStops, visibleRoutes) {
    var routesByPair = new Map();
    var markup = [];

    visibleRoutes.forEach(function (route) {
      routesByPair.set(route.fromStopId + "::" + route.toStopId, route);
    });

    visibleStops.forEach(function (stop, index) {
      markup.push(renderStopCard(stop));

      if (index < visibleStops.length - 1) {
        var nextStop = visibleStops[index + 1];
        var route = routesByPair.get(stop.id + "::" + nextStop.id);
        if (route) {
          markup.push(renderRouteConnector(route));
        }
      }
    });

    return '<div class="stop-timeline">' + markup.join("") + "</div>";
  }

  function renderStopCard(stop) {
    var reservationStatus = stop.reservationStatus || "Not Required";
    var additionalLandmarks = stop.extraLandmarkIds && stop.extraLandmarkIds.length
      ? stop.extraLandmarkIds.map(function (landmarkId) {
        var landmark = state.landmarkLookup.get(landmarkId);
        return landmark ? landmark.name : landmarkId;
      }).join(", ")
      : "";

    return [
      '<article class="stop-card ' + (stop.id === state.selectedStopId ? "is-selected" : "") + '" data-stop-card-id="' + escapeHtml(stop.id) + '">',
      '  <button class="stop-card__header" type="button" data-stop-select="' + escapeHtml(stop.id) + '">',
      '    <span class="stop-card__order">' + escapeHtml(String(stop.order)) + "</span>",
      "    <div>",
      '      <strong>' + escapeHtml(stop.title) + "</strong>",
      stop.chineseName ? '      <p class="detail-meta">' + escapeHtml(stop.chineseName) + "</p>" : "",
      "    </div>",
      '    <span class="mini-pill">' + escapeHtml(formatTimeRange(stop.startTime, stop.endTime)) + "</span>",
      "  </button>",
      '  <div class="detail-chip-list">',
      '    <span class="priority-pill priority-pill--' + escapeHtml(normalizeForCss(stop.priority)) + '">' + escapeHtml(stop.priority) + "</span>",
      '    <span class="mini-pill">' + escapeHtml(stop.type) + "</span>",
      stop.category ? '    <span class="mini-pill">' + escapeHtml(stop.category) + "</span>" : "",
      '    <span class="reservation-pill reservation-pill--' + escapeHtml(normalizeForCss(reservationStatus)) + '">' + escapeHtml(reservationStatus) + "</span>",
      "  </div>",
      '  <p class="detail-copy">' + escapeHtml(stop.description) + "</p>",
      additionalLandmarks ? '<p class="detail-copy"><strong>Related landmarks:</strong> ' + escapeHtml(additionalLandmarks) + "</p>" : "",
      '  <div class="stop-card__meta">',
      '    <div class="detail-stat"><strong>Transportation</strong><span>' + escapeHtml(stop.transportation || formatModeLabel(stop.transportationMode)) + "</span></div>",
      '    <div class="detail-stat"><strong>Distance</strong><span>' + escapeHtml(stop.distance || "Not specified") + "</span></div>",
      '    <div class="detail-stat"><strong>Travel time</strong><span>' + escapeHtml(stop.estimatedTravelTime || "On-site activity") + "</span></div>",
      "  </div>",
      '  <div class="stop-card__controls">',
      '    <label class="field-stack">',
      "      <span>Priority</span>",
      '      <select data-stop-priority="' + escapeHtml(stop.id) + '">',
             createSelectOptions(["Must See", "High", "Medium", "Optional"], stop.priority),
      "      </select>",
      "    </label>",
      '    <label class="field-stack">',
      "      <span>Reservation</span>",
      '      <select data-stop-reservation="' + escapeHtml(stop.id) + '" ' + (stop.reservationRequired ? "" : "disabled") + ">",
             createSelectOptions(["Not Required", "Not Booked", "Booked", "Confirmed"], reservationStatus),
      "      </select>",
      "    </label>",
      '    <label class="field-stack field-stack--wide">',
      "      <span>Personal notes</span>",
      '      <textarea data-stop-notes="' + escapeHtml(stop.id) + '" rows="2" placeholder="Add stop-specific notes...">' + escapeHtml(stop.personalNotes || "") + "</textarea>",
      "    </label>",
      "  </div>",
      stop.image ? createInlineMediaCard(stop) : "",
      "</article>"
    ].join("");
  }

  function createInlineMediaCard(stop) {
    return [
      '<div class="detail-media detail-media--compact" data-media-card>',
      '  <img class="detail-image" data-optional-image src="' + escapeHtml(stop.image) + '" alt="' + escapeHtml(stop.title) + '">',
      '  <div class="image-placeholder">',
      "    <div>",
      "      <strong>Photo placeholder</strong>",
      "      <p>Add a local image later at <code>" + escapeHtml(stop.image) + "</code>.</p>",
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderRouteConnector(route) {
    return [
      '<div class="route-connector route-connector--' + escapeHtml(normalizeForCss(route.mode)) + '">',
      '  <span class="mini-pill">' + escapeHtml(route.modeLabel) + "</span>",
      '  <strong>' + escapeHtml(route.distance || "Distance pending") + "</strong>",
      '  <p class="detail-copy">' + escapeHtml(route.estimatedDuration || "Timing pending") + " • " + escapeHtml(route.routeStatus) + "</p>",
      "</div>"
    ].join("");
  }

  function renderLandmarkDetails(landmark) {
    if (!detailContentElement || !detailKickerElement) {
      return;
    }

    var city = state.cityLookup.get(landmark.cityId) || state.cityLookup.get(state.selectedCityId);
    var relatedStop = state.selectedDayId ? findStopForLandmarkInDay(landmark.id, state.selectedDayId) : null;

    detailKickerElement.textContent = "Landmark details";

    detailContentElement.innerHTML = [
      '<section class="detail-section">',
      '  <div class="detail-header">',
      "    <div>",
      "      <h2>" + escapeHtml(landmark.name) + "</h2>",
      '      <p class="detail-subtitle">' + escapeHtml(landmark.chineseName + " • " + (city ? city.name : "Trip map")) + "</p>",
      "    </div>",
      '    <div class="detail-chip-list">',
      '      <span class="status-pill">' + escapeHtml(landmark.status || "Interested") + "</span>",
      '      <span class="mini-pill">' + escapeHtml(landmark.category) + "</span>",
      "    </div>",
      "  </div>",
      createStandaloneMediaCard(landmark),
      '  <p class="detail-copy">' + escapeHtml(landmark.description) + "</p>",
      '  <div class="detail-stat-grid">',
      createDetailStat("Suggested visit", landmark.visitLength),
      createDetailStat("Category", landmark.category),
      createDetailStat("City", city ? city.name : "Trip map"),
      createDetailStat("Reservation", landmark.reservationNote ? "Check note" : "Not noted"),
      "  </div>",
      landmark.reservationNote
        ? '<div class="info-callout"><h3>Reservation note</h3><p class="detail-copy">' + escapeHtml(landmark.reservationNote) + "</p></div>"
        : "",
      relatedStop
        ? '<div class="info-callout"><h3>Itinerary context</h3><p class="detail-copy">' + escapeHtml(formatDate(state.dayLookup.get(relatedStop.dayId).date) + " • Stop " + relatedStop.order + " in the active itinerary day.") + '</p><button class="detail-link-button" type="button" data-stop-select="' + escapeHtml(relatedStop.id) + '">Jump to stop card</button></div>'
        : "",
      '  <div class="action-row">',
      '    <button class="action-button" type="button" data-action="open-map" data-name="' + escapeHtml(landmark.name) + '">Open in Map</button>',
      '    <button class="action-button" type="button" data-action="add-plan" data-name="' + escapeHtml(landmark.name) + '">Add to Plan</button>',
      state.selectedDayId
        ? '    <button class="detail-link-button" type="button" data-back-day="' + escapeHtml(state.selectedDayId) + '">Back to Daily Itinerary</button>'
        : state.selectedCityId
          ? '    <button class="detail-link-button" type="button" data-back-city="' + escapeHtml(state.selectedCityId) + '">Back to City Overview</button>'
          : '    <button class="detail-link-button" type="button" data-return-overview="true">Return to China Overview</button>',
      "  </div>",
      "</section>"
    ].join("");

    attachOptionalImageHandlers();
  }

  function createStandaloneMediaCard(landmark) {
    return [
      '<div class="detail-media" data-media-card>',
      '  <img class="detail-image" data-optional-image src="' + escapeHtml(landmark.image) + '" alt="' + escapeHtml(landmark.name) + '">',
      '  <div class="image-placeholder">',
      "    <div>",
      "      <strong>Photo placeholder</strong>",
      "      <p>Add a local image later at <code>" + escapeHtml(landmark.image) + "</code>.</p>",
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function attachOptionalImageHandlers() {
    detailContentElement.querySelectorAll("[data-optional-image]").forEach(function (image) {
      var parent = image.closest("[data-media-card]");

      if (!parent) {
        return;
      }

      image.addEventListener("load", function () {
        parent.classList.add("has-image");
      }, { once: true });

      image.addEventListener("error", function () {
        parent.classList.remove("has-image");
        image.removeAttribute("src");
      }, { once: true });

      if (image.complete) {
        if (image.naturalWidth > 0) {
          parent.classList.add("has-image");
        } else {
          image.removeAttribute("src");
        }
      }
    });
  }

  function calculateDailySummary(day, visibleStops, visibleRoutes) {
    var times = visibleStops.reduce(function (accumulator, stop) {
      if (stop.startTime) {
        accumulator.starts.push(stop.startTime);
      }
      if (stop.endTime) {
        accumulator.ends.push(stop.endTime);
      } else if (stop.startTime) {
        accumulator.ends.push(stop.startTime);
      }
      return accumulator;
    }, { starts: [], ends: [] });

    return {
      attractions: visibleStops.filter(function (stop) {
        return stop.type === "landmark";
      }).length,
      transfers: visibleRoutes.length,
      reservationsNeeded: visibleStops.filter(function (stop) {
        return stop.reservationRequired;
      }).length,
      walking: day.expectedWalking,
      earliestStart: times.starts.length ? sortTimes(times.starts)[0] : "Flexible",
      latestFinish: times.ends.length ? sortTimes(times.ends).slice(-1)[0] : "Flexible",
      mustSeeCount: visibleStops.filter(function (stop) {
        return stop.priority === "Must See";
      }).length
    };
  }

  function describeActiveFilters() {
    var activeFilters = [];

    if (state.filters.cityId !== "all") {
      activeFilters.push("city");
    }
    if (state.filters.date !== "all") {
      activeFilters.push("date");
    }
    if (state.filters.priority !== "all") {
      activeFilters.push("priority");
    }
    if (state.filters.reservationStatus !== "all") {
      activeFilters.push("reservation");
    }
    if (state.filters.transportationMode !== "all") {
      activeFilters.push("transport");
    }
    if (state.filters.category !== "all") {
      activeFilters.push("category");
    }
    if (state.filters.bookedOnly) {
      activeFilters.push("booked-only");
    }
    if (state.filters.mustSeeOnly) {
      activeFilters.push("must-see-only");
    }

    if (!activeFilters.length) {
      return "No stop-level filters are active. You are seeing the full itinerary for the selected day.";
    }

    return "Active filters: " + activeFilters.join(", ") + ".";
  }

  function getFilteredStopsForDay(dayId) {
    return getHydratedStopsForDay(dayId).filter(matchesStopFilters);
  }

  function matchesStopFilters(stop) {
    if (state.filters.priority !== "all" && stop.priority !== state.filters.priority) {
      return false;
    }

    if (state.filters.reservationStatus !== "all" && stop.reservationStatus !== state.filters.reservationStatus) {
      return false;
    }

    if (state.filters.transportationMode !== "all" && stop.transportationMode !== state.filters.transportationMode) {
      return false;
    }

    if (state.filters.category !== "all" && stop.category !== state.filters.category) {
      return false;
    }

    if (state.filters.bookedOnly && !isBookedStatus(stop.reservationStatus)) {
      return false;
    }

    if (state.filters.mustSeeOnly && stop.priority !== "Must See") {
      return false;
    }

    return true;
  }

  function getVisibleLocalRoutes(dayId, visibleStops) {
    var visibleStopIds = new Set(visibleStops.map(function (stop) {
      return stop.id;
    }));

    return getHydratedLocalRoutesForDay(dayId).filter(function (route) {
      if (!visibleStopIds.has(route.fromStopId) || !visibleStopIds.has(route.toStopId)) {
        return false;
      }

      if (state.filters.transportationMode !== "all" && route.mode !== state.filters.transportationMode) {
        return false;
      }

      return route.points.length > 0;
    });
  }

  function getHydratedStopsForDay(dayId) {
    return getStopsForDay(dayId).map(function (stop) {
      return hydrateStop(stop);
    });
  }

  function getHydratedLocalRoutesForDay(dayId) {
    return getLocalRoutesForDay(dayId).map(function (route) {
      return hydrateLocalRoute(route);
    });
  }

  function hydrateStop(stop) {
    var landmark = stop.landmarkId ? state.landmarkLookup.get(stop.landmarkId) : null;
    var edits = state.edits.stops[stop.id] || {};
    var coordinates = getStopCoordinates(stop, landmark);

    return {
      id: stop.id,
      dayId: stop.dayId,
      order: stop.order,
      type: stop.type,
      landmarkId: stop.landmarkId || null,
      extraLandmarkIds: Array.isArray(stop.extraLandmarkIds) ? stop.extraLandmarkIds : [],
      title: stop.title || (landmark ? landmark.name : "Untitled stop"),
      chineseName: stop.chineseName || (landmark ? landmark.chineseName : ""),
      description: stop.description || (landmark ? landmark.description : ""),
      category: landmark ? landmark.category : stop.category || mapStopTypeToCategory(stop.type),
      transportation: stop.transportation || formatModeLabel(stop.transportationMode),
      transportationMode: stop.transportationMode || stop.type,
      distance: stop.distance || null,
      estimatedTravelTime: stop.estimatedTravelTime || null,
      startTime: stop.startTime || null,
      endTime: stop.endTime || null,
      priority: edits.priority || stop.priority || "Medium",
      reservationRequired: Boolean(stop.reservationRequired),
      reservationStatus: edits.reservationStatus || stop.reservationStatus || "Not Required",
      personalNotes: edits.notes || "",
      image: landmark ? landmark.image : "",
      latitude: coordinates ? coordinates.lat : null,
      longitude: coordinates ? coordinates.lng : null
    };
  }

  function hydrateLocalRoute(route) {
    var fromStop = hydrateStop(state.stopLookup.get(route.fromStopId));
    var toStop = hydrateStop(state.stopLookup.get(route.toStopId));
    var hasCoordinates = isFiniteNumber(fromStop.latitude) && isFiniteNumber(fromStop.longitude) && isFiniteNumber(toStop.latitude) && isFiniteNumber(toStop.longitude);
    var points = [];

    if (hasCoordinates) {
      points = route.mode === "flight"
        ? buildCurvedPath([fromStop.latitude, fromStop.longitude], [toStop.latitude, toStop.longitude], 0.08)
        : [
            [fromStop.latitude, fromStop.longitude],
            [toStop.latitude, toStop.longitude]
          ];
    }

    return {
      id: route.id,
      dayId: route.dayId,
      order: route.order,
      fromStopId: route.fromStopId,
      toStopId: route.toStopId,
      mode: route.mode,
      modeLabel: route.modeLabel,
      distance: route.distance,
      estimatedDuration: route.estimatedDuration,
      routeStatus: route.routeStatus,
      lineStyle: route.lineStyle,
      points: points
    };
  }

  function getStopCoordinates(stop, landmark) {
    if (isFiniteNumber(stop.latitude) && isFiniteNumber(stop.longitude)) {
      return { lat: stop.latitude, lng: stop.longitude };
    }

    if (landmark && isFiniteNumber(landmark.latitude) && isFiniteNumber(landmark.longitude)) {
      return { lat: landmark.latitude, lng: landmark.longitude };
    }

    return null;
  }

  function buildCurvedPath(fromPoint, toPoint, curveStrength) {
    var start = window.L.latLng(fromPoint[0], fromPoint[1]);
    var end = window.L.latLng(toPoint[0], toPoint[1]);
    var latOffset = Math.max(0.25, Math.abs(start.lat - end.lat) * curveStrength);
    var lngOffset = (end.lng - start.lng) * 0.06;
    var controlPoint = window.L.latLng(
      ((start.lat + end.lat) / 2) + latOffset,
      ((start.lng + end.lng) / 2) - lngOffset
    );
    var points = [];
    var step;

    for (step = 0; step <= 24; step += 1) {
      var t = step / 24;
      var lat = quadraticBezier(start.lat, controlPoint.lat, end.lat, t);
      var lng = quadraticBezier(start.lng, controlPoint.lng, end.lng, t);
      points.push([lat, lng]);
    }

    return points;
  }

  function quadraticBezier(start, control, end, t) {
    return Math.pow(1 - t, 2) * start + (2 * (1 - t) * t * control) + (Math.pow(t, 2) * end);
  }

  function updateToolbar(title, description) {
    state.toolbarTitle = title;
    state.toolbarDescription = description;

    if (toolbarTitleElement) {
      toolbarTitleElement.textContent = title;
    }
    if (toolbarDescriptionElement) {
      toolbarDescriptionElement.textContent = description;
    }
  }

  function updateSelectionChip(label) {
    if (selectionChipElement) {
      selectionChipElement.textContent = label;
    }
  }

  function updateCityButtonState() {
    if (!cityButtonListElement) {
      return;
    }

    cityButtonListElement.querySelectorAll("[data-city-select]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-city-select") === state.selectedCityId);
    });
  }

  function updateDayButtonState() {
    if (!itineraryDayListElement) {
      return;
    }

    itineraryDayListElement.querySelectorAll("[data-day-select]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-day-select") === state.selectedDayId);
    });
  }

  function getOrderedCities() {
    return tripCities.slice().sort(function (firstCity, secondCity) {
      return firstCity.sequence[0] - secondCity.sequence[0];
    });
  }

  function getSortedItineraryDays() {
    return itineraryDays.slice().sort(function (firstDay, secondDay) {
      return firstDay.date.localeCompare(secondDay.date);
    });
  }

  function getEffectiveFilterCityId() {
    if (state.filters.cityId !== "all") {
      return state.filters.cityId;
    }

    if (state.selectedCityId) {
      return state.selectedCityId;
    }

    return "all";
  }

  function getItineraryDaysForCity(cityId) {
    return getSortedItineraryDays().filter(function (day) {
      return day.cityId === cityId;
    });
  }

  function getStopsForDay(dayId) {
    return itineraryStops.filter(function (stop) {
      return stop.dayId === dayId;
    }).sort(function (firstStop, secondStop) {
      return firstStop.order - secondStop.order;
    });
  }

  function getLocalRoutesForDay(dayId) {
    return localRoutes.filter(function (route) {
      return route.dayId === dayId;
    }).sort(function (firstRoute, secondRoute) {
      return firstRoute.order - secondRoute.order;
    });
  }

  function getLandmarksForCity(cityId) {
    return tripLandmarks.filter(function (landmark) {
      return landmark.cityId === cityId;
    });
  }

  function findStopForLandmarkInSelectedCity(landmarkId, cityId) {
    var matchingDay = getItineraryDaysForCity(cityId).find(function (day) {
      return day.landmarkIds.indexOf(landmarkId) !== -1;
    });

    return matchingDay ? findStopForLandmarkInDay(landmarkId, matchingDay.id) : null;
  }

  function findStopForLandmarkInDay(landmarkId, dayId) {
    return getHydratedStopsForDay(dayId).find(function (stop) {
      return stop.landmarkId === landmarkId || stop.extraLandmarkIds.indexOf(landmarkId) !== -1;
    }) || null;
  }

  function getDayStatus(dayId, defaultStatus) {
    return (state.edits.days[dayId] && state.edits.days[dayId].status) || defaultStatus || "Planned";
  }

  function getDayNotes(dayId) {
    return (state.edits.days[dayId] && state.edits.days[dayId].notes) || "";
  }

  function getCityDetailZoom(city) {
    return city && city.detailZoom ? city.detailZoom : 11;
  }

  function mapStopTypeToCategory(type) {
    var map = {
      hotel: "Hotel",
      rest: "Rest",
      meal: "Meal",
      transfer: "Transfer",
      train: "Transportation",
      flight: "Transportation",
      flexible: "Flexible"
    };

    return map[type] || "Landmark";
  }

  function renderStandaloneFallbackButton(cityId) {
    return cityId
      ? '<button class="detail-link-button" type="button" data-back-city="' + escapeHtml(cityId) + '">Back to City Overview</button>'
      : '<button class="detail-link-button" type="button" data-return-overview="true">Return to China Overview</button>';
  }

  function createSummaryCard(value, label) {
    return [
      '<div class="summary-card">',
      "  <strong>" + escapeHtml(value) + "</strong>",
      "  <span>" + escapeHtml(label) + "</span>",
      "</div>"
    ].join("");
  }

  function createDetailStat(label, value) {
    return [
      '<div class="detail-stat">',
      "  <strong>" + escapeHtml(label) + "</strong>",
      "  <span>" + escapeHtml(value) + "</span>",
      "</div>"
    ].join("");
  }

  function createSelectOptions(options, selectedValue) {
    return options.map(function (value) {
      return '<option value="' + escapeHtml(value) + '" ' + (value === selectedValue ? "selected" : "") + '>' + escapeHtml(value) + "</option>";
    }).join("");
  }

  function sortTimes(values) {
    return values.slice().sort();
  }

  function formatDate(value) {
    var date = new Date(value + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatShortDate(value) {
    var date = new Date(value + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  }

  function formatDayFilterLabel(day) {
    var city = state.cityLookup.get(day.cityId);
    return formatShortDate(day.date) + " • " + city.name + " • " + day.title;
  }

  function formatTimeRange(startTime, endTime) {
    if (startTime && endTime) {
      return startTime + "-" + endTime;
    }

    if (startTime) {
      return startTime + " onward";
    }

    if (endTime) {
      return "Until " + endTime;
    }

    return "Flexible timing";
  }

  function formatModeLabel(mode) {
    var labels = {
      walk: "Walk",
      subway: "Subway",
      taxi: "DiDi / taxi",
      "private-car": "Private car",
      train: "Train",
      flight: "Flight",
      boat: "Boat",
      shuttle: "Shuttle",
      chairlift: "Chairlift",
      toboggan: "Toboggan",
      flexible: "Flexible transfer",
      meal: "Meal",
      hotel: "Hotel",
      indoor: "Indoor visit",
      metro: "Metro"
    };

    return labels[mode] || String(mode || "Activity").replace(/-/g, " ");
  }

  function getCategoryCode(category) {
    var normalized = String(category || "").toLowerCase();

    if (normalized === "historic site") {
      return "HS";
    }
    if (normalized === "shopping") {
      return "SH";
    }
    if (normalized === "cultural site") {
      return "CS";
    }
    if (normalized === "sightseeing") {
      return "SI";
    }
    if (normalized === "nature") {
      return "NA";
    }
    if (normalized === "museum") {
      return "MU";
    }
    if (normalized === "transportation") {
      return "TR";
    }
    if (normalized === "theme park") {
      return "TP";
    }
    if (normalized === "neighborhood") {
      return "NB";
    }
    if (normalized === "city landmark") {
      return "CL";
    }

    return "LM";
  }

  function getRouteMarkerSymbol(mode) {
    var symbols = {
      train: "🚆",
      flight: "✈",
      boat: "⛴",
      subway: "M",
      walk: "→",
      taxi: "→",
      "private-car": "→",
      shuttle: "→",
      chairlift: "→",
      toboggan: "→",
      flexible: "→"
    };

    return symbols[mode] || "→";
  }

  function normalizeForCss(value) {
    return String(value || "default").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function isBookedStatus(value) {
    return value === "Booked" || value === "Confirmed";
  }

  function handlePlaceholderAction(button) {
    var action = button.getAttribute("data-action");
    var name = button.getAttribute("data-name") || "this item";
    var message;

    if (action === "open-map") {
      message = "Placeholder action: open " + name + " in a map app.";
    } else if (action === "add-plan") {
      message = "Placeholder action: add " + name + " to the plan.";
    } else {
      message = "Placeholder action triggered.";
    }

    window.console.log(message);
    window.alert(message);
  }

  function toggleSidebar(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean"
      ? forceOpen
      : !document.body.classList.contains("sidebar-open");

    document.body.classList.toggle("sidebar-open", shouldOpen);

    if (menuToggleElement) {
      menuToggleElement.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }

    scheduleMapResize(240);
  }

  function stripTime(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toRadians(value) {
    return value * (Math.PI / 180);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
