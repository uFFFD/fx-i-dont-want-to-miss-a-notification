// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2015 uFFFD
 *
 * Alternatively, the contents of this file may be used under the terms
 * of the GNU General Public License Version 3+, as described below:
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
original source:
http://mxr.mozilla.org/mozilla-central/source/toolkit/components/alerts/resources/content/alert.js
chrome://global/content/alerts/alert.js
*/

Components.utils.import("resource://gre/modules/Services.jsm");

const Ci = Components.interfaces;
const Cc = Components.classes;

var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Ci.nsIWindowMediator);

// Copied from nsILookAndFeel.h, see comments on eMetric_AlertNotificationOrigin
const NS_ALERT_HORIZONTAL = 1;
const NS_ALERT_LEFT = 2;
const NS_ALERT_TOP = 4;

const WINDOW_MARGIN = 10;

var gOrigin = 0; // Default value: alert from bottom right.
var gReplacedWindow = null;
var gAlertListener = null;
var gAlertTextClickable = false;
var gAlertCookie = "";
var gIsReplaced = false;

function prefillAlertInfo() {
  // unwrap all the args....
  // arguments[0] --> the image src url
  // arguments[1] --> the alert title
  // arguments[2] --> the alert text
  // arguments[3] --> is the text clickable?
  // arguments[4] --> the alert cookie to be passed back to the listener
  // arguments[5] --> the alert origin reported by the look and feel
  // arguments[6] --> bidi
  // arguments[7] --> lang
  // arguments[8] --> replaced alert window (nsIDOMWindow)
  // arguments[9] --> an optional callback listener (nsIObserver)

  switch (window.arguments.length) {
    default:
    case 10:
      gAlertListener = window.arguments[9];
    case 9:
      gReplacedWindow = window.arguments[8];
    case 8:
      if (window.arguments[7]) {
        document.getElementById('alertTitleLabel').setAttribute('lang', window.arguments[7]);
        document.getElementById('alertTextLabel').setAttribute('lang', window.arguments[7]);
      }
    case 7:
      if (window.arguments[6]) {
        document.getElementById('alertNotification').style.direction = window.arguments[6];
      }
    case 6:
      gOrigin = window.arguments[5];
    case 5:
      gAlertCookie = window.arguments[4];
    case 4:
      gAlertTextClickable = window.arguments[3];
      if (gAlertTextClickable) {
        document.getElementById('alertNotification').setAttribute('clickable', true);
        document.getElementById('alertTextLabel').setAttribute('clickable', true);
      }
    case 3:
      document.getElementById('alertTextLabel').textContent = window.arguments[2];
    case 2:
      document.getElementById('alertTitleLabel').setAttribute('value', window.arguments[1]);
    case 1:
      if (window.arguments[0]) {
        document.getElementById('alertImage').setAttribute('src', window.arguments[0]);
      }
    case 0:
      break;
  }
}

function onAlertLoad() {
  let alertDuration = 4; // in seconds
  try {
    alertDuration = Services.prefs.getIntPref("extensions.idwtman@uFFFD.notificationDuration");
    if (alertDuration < 0)
      alertDuration = 0;
  }
  catch (e) {
    console.error(`${e.name}: ${e.message}`);
  }

  let alertTextBox = document.getElementById("alertTextBox");
  let alertImageBox = document.getElementById("alertImageBox");
  alertImageBox.style.minHeight = alertTextBox.scrollHeight + "px";

  sizeToContent();

  if (gReplacedWindow && !gReplacedWindow.closed) {
    moveWindowToReplace(gReplacedWindow);
    gReplacedWindow.gIsReplaced = true;
    gReplacedWindow.close();
  } else {
    moveWindowToEnd();
  }

  window.addEventListener("XULAlertClose", function() { window.close(); });

  if (Services.prefs.getBoolPref("alerts.disableSlidingEffect")) {
    if (alertDuration != 0)
      setTimeout(function() { window.close(); }, alertDuration * 1000);
    return;
  }

  let alertBox = document.getElementById("alertBox");
  alertBox.addEventListener("animationend", function hideAlert(event) {
    switch (event.animationName) {
      case "alert-animation-beginning":
        if (alertDuration == 0) {
          alertBox.removeEventListener("animationend", hideAlert, false);
        }
        else {
          alertBox.style.animationName = "alert-animation-middle";
          alertBox.style.animationDuration = `${alertDuration - 2}s`;
        }
        break;
      case "alert-animation-middle":
        alertBox.style.animationName = "alert-animation-end";
        alertBox.style.animationDuration = "1s";
        break;
      case "alert-animation-end":
      case "alert-animation":
        alertBox.removeEventListener("animationend", hideAlert, false);
        window.close();
        break;
      default:
        return;
    }
  }, false);
  if (alertDuration == 0 || alertDuration > 4) {
    // alert-animation-beginning: 1s
    // alert-animation-middle: duration - 2s if duration > 4
    // alert-animation-end: 1s if duration > 4
    alertBox.style.animationName = "alert-animation-beginning";
    alertBox.style.animationDuration = "1s";
  }
  else {
    // alert-animation: 1~4s
    alertBox.style.animationName = "alert-animation";
    alertBox.style.animationDuration = `${alertDuration}s`;
  }
  alertBox.setAttribute("animate", true);

  if (gAlertListener) {
    gAlertListener.observe(null, "alertshow", gAlertCookie);
  }
}

function moveWindowToReplace(aReplacedAlert) {
  let heightDelta = window.outerHeight - aReplacedAlert.outerHeight;

  // Move windows that come after the replaced alert if the height is different.
  if (heightDelta != 0) {
    let windows = windowMediator.getEnumerator('alert:alert');
    while (windows.hasMoreElements()) {
      let alertWindow = windows.getNext();
      // boolean to determine if the alert window is after the replaced alert.
      let alertIsAfter = gOrigin & NS_ALERT_TOP ?
                         alertWindow.screenY > aReplacedAlert.screenY :
                         aReplacedAlert.screenY > alertWindow.screenY;
      if (alertIsAfter) {
        // The new Y position of the window.
        let adjustedY = gOrigin & NS_ALERT_TOP ?
                        alertWindow.screenY + heightDelta :
                        alertWindow.screenY - heightDelta;
        alertWindow.moveTo(alertWindow.screenX, adjustedY);
      }
    }
  }

  let adjustedY = gOrigin & NS_ALERT_TOP ? aReplacedAlert.screenY :
                  aReplacedAlert.screenY - heightDelta;
  window.moveTo(aReplacedAlert.screenX, adjustedY);
}

function moveWindowToEnd() {
  // Determine position
  let x = gOrigin & NS_ALERT_LEFT ? screen.availLeft :
          screen.availLeft + screen.availWidth - window.outerWidth;
  let y = gOrigin & NS_ALERT_TOP ? screen.availTop :
          screen.availTop + screen.availHeight - window.outerHeight;

  // Position the window at the end of all alerts.
  let windows = windowMediator.getEnumerator('alert:alert');
  while (windows.hasMoreElements()) {
    let alertWindow = windows.getNext();
    if (alertWindow != window) {
      if (gOrigin & NS_ALERT_TOP) {
        y = Math.max(y, alertWindow.screenY + alertWindow.outerHeight);
      } else {
        y = Math.min(y, alertWindow.screenY - window.outerHeight);
      }
    }
  }

  // Offset the alert by WINDOW_MARGIN pixels from the edge of the screen
  y += gOrigin & NS_ALERT_TOP ? WINDOW_MARGIN : -WINDOW_MARGIN;
  x += gOrigin & NS_ALERT_LEFT ? WINDOW_MARGIN : -WINDOW_MARGIN;

  window.moveTo(x, y);
}

function onAlertBeforeUnload() {
  if (!gIsReplaced) {
    // Move other alert windows to fill the gap left by closing alert.
    let heightDelta = window.outerHeight + WINDOW_MARGIN;
    let windows = windowMediator.getEnumerator('alert:alert');
    while (windows.hasMoreElements()) {
      let alertWindow = windows.getNext();
      if (alertWindow != window) {
        if (gOrigin & NS_ALERT_TOP) {
          if (alertWindow.screenY > window.screenY) {
            alertWindow.moveTo(alertWindow.screenX, alertWindow.screenY - heightDelta);
          }
        } else {
          if (window.screenY > alertWindow.screenY) {
            alertWindow.moveTo(alertWindow.screenX, alertWindow.screenY + heightDelta);
          }
        }
      }
    }
  }

  if (gAlertListener) {
    gAlertListener.observe(null, "alertfinished", gAlertCookie);
  }
}

function onAlertClick() {
  if (gAlertListener && gAlertTextClickable) {
    gAlertListener.observe(null, "alertclickcallback", gAlertCookie);
  }

  window.close();
}
