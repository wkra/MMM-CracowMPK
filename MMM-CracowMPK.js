/* global Log, Module, moment */

/* Magic Mirror
 * Module: MMM-CracowMPK
 *
 * By wkrawiec https://wkrawiec.pl
 * MIT Licensed.
 * 
 */

Module.register("MMM-CracowMPK", {
  // Module config defaults.
  defaults: {
    stopId: -1,
    stopName: '',
    apiUrl: "http://www.ttss.krakow.pl/internetservice/services/passageInfo/stopPassages/stop?stop=%STOP_ID%&mode=departure",
    stopIdTemplate: "%STOP_ID%",
    updateInterval: 1000 * 60, //one min = 1000 * 60
    excludedDirections: [],
    actual: [],
    routes: {},
    maxLines: 7,
    displayNone: true,
    minutesDelay: 0,
    displayStartHour: 0,
    displayEndHour: 24
  },

  // Define required scripts.
  getScripts() {
    return ["moment.js"];
  },

  // Define required scripts.
  getStyles() {
    return ["MMM-CracowMPK.css"];
  },

  // Define required translations.
  getTranslations() {
    return {
      'en': 'translations/en.json',
      'pl': 'translations/pl.json'
    };
  },

  // communication with node_helper
  socketNotificationReceived(notification, {
    statusCode,
    body
  }) {
    if (notification === "NEW_MPK_DATA") {
      this.newDataHandler(statusCode, body);
    }
    if (notification === "NEW_MPK_STOP") {
      this.newStopHandler(statusCode, body);
    }
  },

  // Define start sequence.
  start() {
    Log.info("Starting module: " + this.name);

    // Check required config field
    if (this.config.stopId === -1 && this.config.stopName === '') {
      const message = `${this.name} ERROR: you need to fill "stopId" or "stopName" field in config file.`
      this.sendSocketNotification("NOTIFICATION_MPK", message)
      Log.info(message);
    } else if (this.config.stopName !== '') {
      this.sendSocketNotification("SEARCH_MPK_STOP", this.config.stopName);
    } else {
      this.initModule();
    }
  },

  initModule() {
    this.setApiUrl();
    this.setTimer();
    moment.locale(config.language);

    // load data immediately
    if (this.checkTime()) {
      this.fetchData();
    }
  },

  setApiUrl() {
    this.config.apiUrl = this.config.apiUrl.replace(this.config.stopIdTemplate, this.config.stopId);
  },

  setTimer() {
    setInterval(() => {
      if (this.checkTime()) {
        this.fetchData();
      } else {
        this.hideDisplay();
      }
    }, this.config.updateInterval);
  },

  // fetch mpk data
  fetchData() {
    this.sendSocketNotification("FETCH_MPK_DATA", this.config.apiUrl);
  },

  // new mpk data handler
  newDataHandler(statusCode, body) {
    if (statusCode === 200) {
      const parseBody = JSON.parse(body)
      let actualData = parseBody.actual;

      if (this.config.displayNone) {
        this.config.displayNone = false;
      }
      if (this.config.excludedDirections.length > 0) {
        actualData = this.filterExcludedDirections(actualData);
      }
      if (this.config.minutesDelay > 0) {
        actualData = this.filterDelay(actualData);
      }
      if (!this.config.stopName) {
        this.config.stopName = parseBody.stopName;
      }
      this.config.routes = parseBody.routes
      this.config.actual = actualData;
    } else {
      this.config.displayNone = true;
      this.sendConnectionError();
    }
    this.updateDom();
  },

  newStopHandler(statusCode, body) {
    if (statusCode === 200) {
      const parseBody = JSON.parse(body);
      const count = parseBody[0].count;

      if (count === 0) {
        const message = `${this.name} ERROR: There is no results for the stop: ${this.config.stopName}. Please specify "stopName" in config file.`
        this.sendSocketNotification("NOTIFICATION_MPK", message)
        Log.info(message);
      } else if (count > 1) {
        const message = `${this.name} ERROR: There are many matching results for the stop: ${this.config.stopName}. Please specify "stopName" in config file.`
        this.sendSocketNotification("NOTIFICATION_MPK", message)
        Log.info(message);
      } else {
        this.config.stopId = parseInt(parseBody[1].id);
        this.config.stopName = parseBody[1].name;
        this.initModule();
      }
    } else {
      this.sendConnectionError();
    }
  },

  sendConnectionError() {
    const message = `${this.name} ERROR: Ups, some problem with connection.`
    this.sendSocketNotification("NOTIFICATION_MPK", message)
    Log.info(message);
  },

  checkTime() {
    const now = moment();
    const hour = parseInt(now.format("HH"), 10);

    return hour < this.config.displayEndHour && hour > this.config.displayStartHour;
  },

  hideDisplay() {
    const fadeTimer = 4000;

    if (!this.config.displayNone) {
      this.config.displayNone = true;
      this.updateDom(fadeTimer);
    }
  },

  filterExcludedDirections(payload) {
    const tempArr = [];

    for (let i = 0; i < payload.length; i++) {
      if (
        this.config.excludedDirections.indexOf(
          payload[i].direction
        ) === -1
      ) {
        tempArr.push(payload[i]);
      }
    }
    return tempArr;
  },

  filterDelay(payload) {
    const tempArr = [];
    const now = moment();
    const hour = now.format("HH");
    const minutes = parseInt(now.format("mm"), 10) + this.config.minutesDelay;
    const compareTime = hour + ":" + minutes;
    const unitMin = "%UNIT_MIN%";

    for (let i = 0; i < payload.length; i++) {
      let indexOfMin = payload[i].mixedTime.indexOf(unitMin);

      if (indexOfMin > -1) {
        //relative time
        if (
          parseInt(payload[i].mixedTime.split(unitMin)[0], 10) >=
          this.config.minutesDelay
        ) {
          payload[i].mixedTime = payload[
            i
          ].mixedTime.replace(unitMin, "min");
          tempArr.push(payload[i]);
        }
      } else {
        // absolute time
        if (payload[i].mixedTime >= compareTime) {
          tempArr.push(payload[i]);
        }
      }
    }
    return tempArr;
  },

  getLineNumber(routeId) {
    const routes = this.config.routes;
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].id === routeId) {
        return routes[i].name;
      }
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mpk";

    if (this.config.displayNone) {
      wrapper.innerHTML = "";
    } else if (this.config.actual.length < 1) {
      wrapper.innerHTML = "Waiting for data...";
    } else {
      const maxElements = Math.min(this.config.actual.length, this.config.maxLines);
      const delayTemplate = this.config.minutesDelay > 0 ?
        `<br><span class="mpk__header-delay">(${this.translate("for")} ${this.config.minutesDelay}min)</span>` :
        ''
      wrapper.innerHTML = `
        <div class="mpk__header-wrapper">
          <div class="mpk__header">${this.translate("Stop")} <strong>${this.config.stopName}</strong>${delayTemplate}</div>
        </div>
      `;
      for (let i = 0; i < maxElements; i++) {
        let item = document.createElement("div");
        item.className = "mpk__item";
        item.innerHTML += `
          <span class="mpk__line-number">${this.getLineNumber(this.config.actual[i].routeId)}</span>
          <span> ${this.config.actual[i].direction} - ${this.config.actual[i].mixedTime}</span>
        `;
        wrapper.appendChild(item);
      }
    }
    return wrapper;
  }
});