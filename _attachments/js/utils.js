// Err a little NIH, some of the regex stuff is from sammy, but I only
// wanted the routing, and the way sammy implemented routing isnt
// great for my cpu (it polls by default even when the hashchange
// is supported)
var Router = (function() {

  var PATH_REPLACER = "([^\/]+)",
      PATH_MATCHER  = /:([\w\d]+)/g,
      WILD_MATCHER  = /\*([\w\d]+)/g,
      WILD_REPLACER  = "(.*?)",
      fun404        = null,
      lastPage      = null,
      history       = [],
      params        = {},
      routes        = {GET: [], POST: []};

  $.each(document.location.search.slice(1).split("&"), function(i, param) {
    var tmp = param.split("=");
    params[tmp[0]] = tmp[1];
  });

  // Needs namespaced and decoupled and stuff
  function init() {
    $(window).bind("hashchange", urlChanged).trigger("hashchange");
    $(document).bind("submit", formSubmitted);
  }

  function back() {
    history.pop(); // current url
    if (history.length > 0) {
      document.location.href = "#" + history.pop();
    } else {
      document.location.href = "#";
    }
  }

  function get(path, cb) {
    var key = path.toString();
    if (!routes.GET[key]) {
      routes.GET[key] = {};
    }
    routes.GET[key].load = cb;
    routes.GET[key].path = path;
    return {
      unload: function(unloadCallback) {
        routes.GET[key].unload = unloadCallback;
      },
      opts: function(opts) {
        routes.GET[key].opts = opts;
      }
    };
  }

  function post(path, cb) {
    var key = path.toString();
    if (!routes.POST[key]) {
      routes.POST[key] = {};
    }
    var obj = routes.POST[key];
    obj.path = path;
    obj.load = cb;
      return {
      unload: function(unloadCallback) {
        obj.unload = unloadCallback;
      },
      opts: function(opts) {
        obj.opts = opts;
      }
    };
  }

  function refresh(maintainScroll) {
    urlChanged(maintainScroll);
  }

  function error404(fun) {
    fun404 = fun;
  }

  function go(url) {
    document.location.hash = url;
    window.scrollTo(0,0);
  }

  function toRegex(path) {
    if (path.constructor == String) {
      return new RegExp("^" + path.replace(PATH_MATCHER, PATH_REPLACER)
                          .replace(WILD_MATCHER, WILD_REPLACER) +"$");
    } else {
      return path;
    }
  }

  // function route(verb, path, cb) {
  //   routes[verb].push({
  //     path     : toRegex(path),
  //     callback : cb
  //   });
  // }

  function urlChanged(maintainScroll) {
    history.push(window.location.hash.slice(1));
    trigger("GET", window.location.hash.slice(1));
    if (maintainScroll !== true) {
      //window.scrollTo(0,0);
    }
  }

  function formSubmitted(e) {

    e.preventDefault();
    var action = e.target.getAttribute("action");

    if (action[0] === "#") {
      trigger("POST", action.slice(1), e, serialize(e.target));
    }
  }

  function trigger(verb, url, ctx, data) {
    var match = matchPath(verb, url);
    if (match) {
      var args = match.match.slice(1);
      if (verb === "POST") {
        args.unshift(data);
        args.unshift(ctx);
      }
      if (lastPage && lastPage.unload) {
        lastPage.unload.apply(this, args);
      }
      match.details.load.apply(this, args);
      lastPage = match.details;
    } else {
      if (fun404) {
        fun404(verb, url);
      }
    }
  }

  function matchesCurrent(needle) {
    return window.location.hash.slice(1).match(toRegex(needle));
  }

  function matchPath(verb, path) {
    var i, tmp, arr = routes[verb];
    for (var key in routes[verb]) {
      tmp = path.match(routes[verb][key].path);
      if (tmp) {
        return {"match":tmp, "details":routes[verb][key]};
      }
    }
    return false;
  }

  function serialize(obj) {
    var o = {};
    var a = $(obj).serializeArray();
    $.each(a, function() {
      if (o[this.name]) {
        if (!o[this.name].push) {
          o[this.name] = [o[this.name]];
        }
        o[this.name].push(this.value || '');
      } else {
        o[this.name] = this.value || '';
      }
    });
    return o;
  }

  return {
    go      : go,
    back    : back,
    get     : get,
    post    : post,
    init    : init,
    matchesCurrent : matchesCurrent,
    refresh : refresh,
    error404 : error404,
    params : params
  };

});

var Utils = {};

Utils.isMobile = function() {
  return navigator.userAgent.toLowerCase()
    .match(/(android|iphone|ipod|ipad)/) !== null;
};


function linkUp(body, person_prefix, tag_prefix) {

  //body = Mustache.escape(body);
  person_prefix = person_prefix || "#!/mentions/";
  tag_prefix = tag_prefix || "#!/tags/";

  var tmp = body.replace(/((ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?)/gi,function(a) {
    return '<a target="_blank" href="'+a+'">'+a+'</a>';
  });

  function transformText(str) {
    return str.replace(/\@([\w\-]+)/g, function(user,name) {
      return '<a href="'+person_prefix+encodeURIComponent(name)+'">'+user+'</a>';
    }).replace(/\#([\w\-\.]+)/g,function(word,tag) {
      return '<a href="'+tag_prefix+encodeURIComponent(tag)+'">'+word+'</a>';
    });
  };

  function replaceTags(dom) {
    var i, tmp;
    for (i = 0; i < dom.childNodes.length; i++) {
      tmp = (dom.childNodes[i].nodeType === 3 &&
             $(dom.childNodes[i]).parents("a").length === 0)
        ? $("<span>"+transformText(dom.childNodes[i].textContent)+"</span>")[0]
        : replaceTags(dom.childNodes[i]);

      dom.replaceChild(tmp, dom.childNodes[i]);
    }
    return dom;
  };

  var div = document.createElement("div");
  div.innerHTML = tmp;
  return replaceTags(div).innerHTML;

  //return tmp;
};

var dateFormat = function () {
    var    token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
		timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
		timezoneClip = /[^-+\dA-Z]/g,
		pad = function (val, len) {
			val = String(val);
			len = len || 2;
			while (val.length < len) val = "0" + val;
			return val;
		};

	// Regexes and supporting functions are cached through closure
	return function (date, mask, utc) {
		var dF = dateFormat;

		// You can't provide utc if you skip other args (use the "UTC:" mask prefix)
		if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
			mask = date;
			date = undefined;
		}

		// Passing date through Date applies Date.parse, if necessary
		date = date ? new Date(date) : new Date;
		if (isNaN(date)) throw SyntaxError("invalid date");

		mask = String(dF.masks[mask] || mask || dF.masks["default"]);

		// Allow setting the utc argument via the mask
		if (mask.slice(0, 4) == "UTC:") {
			mask = mask.slice(4);
			utc = true;
		}

		var	_ = utc ? "getUTC" : "get",
			d = date[_ + "Date"](),
			D = date[_ + "Day"](),
			m = date[_ + "Month"](),
			y = date[_ + "FullYear"](),
			H = date[_ + "Hours"](),
			M = date[_ + "Minutes"](),
			s = date[_ + "Seconds"](),
			L = date[_ + "Milliseconds"](),
			o = utc ? 0 : date.getTimezoneOffset(),
			flags = {
				d:    d,
				dd:   pad(d),
				ddd:  dF.i18n.dayNames[D],
				dddd: dF.i18n.dayNames[D + 7],
				m:    m + 1,
				mm:   pad(m + 1),
				mmm:  dF.i18n.monthNames[m],
				mmmm: dF.i18n.monthNames[m + 12],
				yy:   String(y).slice(2),
				yyyy: y,
				h:    H % 12 || 12,
				hh:   pad(H % 12 || 12),
				H:    H,
				HH:   pad(H),
				M:    M,
				MM:   pad(M),
				s:    s,
				ss:   pad(s),
				l:    pad(L, 3),
				L:    pad(L > 99 ? Math.round(L / 10) : L),
				t:    H < 12 ? "a"  : "p",
				tt:   H < 12 ? "am" : "pm",
				T:    H < 12 ? "A"  : "P",
				TT:   H < 12 ? "AM" : "PM",
				Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
				o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
				S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
			};

		return mask.replace(token, function ($0) {
			return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
		});
	};
}();

// Some common format strings
dateFormat.masks = {
	"default":      "ddd mmm dd yyyy HH:MM:ss",
	shortDate:      "m/d/yy",
	mediumDate:     "mmm d, yyyy",
	longDate:       "mmmm d, yyyy",
	fullDate:       "dddd, mmmm d, yyyy",
	shortTime:      "h:MM TT",
	mediumTime:     "h:MM:ss TT",
	longTime:       "h:MM:ss TT Z",
	isoDate:        "yyyy-mm-dd",
	isoTime:        "HH:MM:ss",
	isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
	isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
dateFormat.i18n = {
	dayNames: [
		"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
		"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
	],
	monthNames: [
		"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
		"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
	]
};

// For convenience...
Date.prototype.format = function (mask, utc) {
	return dateFormat(this, mask, utc);
};

// Takes an ISO time and returns a string representing how
// long ago the date represents.
function prettyDate(date){
	var diff = (((new Date()).getTime() - date.getTime()) / 1000),
		day_diff = Math.floor(diff / 86400);

	if ( isNaN(day_diff) || day_diff < 0 )
		return;

    return day_diff == 0 && (
		diff < 60 && "just now" ||
			diff < 120 && "1 min ago" ||
			diff < 3600 && Math.floor( diff / 60 ) + " min ago" ||
			diff < 7200 && "1 hour ago" ||
			diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
		day_diff == 1 && "Yesterday" ||
		day_diff < 7 && day_diff + " days ago" ||
		day_diff < 31 && Math.ceil( day_diff / 7 ) + " weeks ago" ||
    day_diff < 365 && Math.ceil( day_diff / 31) + " months ago";
};
