var NodeHelper = require("node_helper");
var request = require("request");

module.exports = NodeHelper.create({
  start: function () {
    console.log(`Starting node helper for: ${this.name}`);
  },

  socketNotificationReceived: function (notification, data) {
    if (notification === "FETCH_MPK_DATA") {
      this.getMpkData(data);
    }
    if (notification === "NOTIFICATION_MPK") {
      this.logNotification(data);
    }
    if (notification === "SEARCH_MPK_STOP") {
      this.getMpkStop(data);
    }

  },

  getMpkData(url) {
    request(url, (error, response, body) => {
      const statusCode = response && response.statusCode;
      this.sendSocketNotification("NEW_MPK_DATA", {
        statusCode,
        body
      })
    });
  },

  getMpkStop(name) {
    name = name.replace(' ', '+');
    const url = `http://www.ttss.krakow.pl/internetservice/services/lookup/autocomplete/json?query=${name}&language=pl`;
    request(url, (error, response, body) => {
      const statusCode = response && response.statusCode;
      this.sendSocketNotification("NEW_MPK_STOP", {
        statusCode,
        body
      })
    });
  },

  logNotification(message) {
    console.log(message)
  }
});