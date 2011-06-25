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
  function init(parent) {
    $(parent).bind("hashchange", urlChanged).trigger("hashchange");
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
    var obj = {path:path, load:cb};
    routes.GET.push(obj);
    return {
      unload: function(unloadCallback) {
        obj.unload = unloadCallback;
      },
      opts: function(opts) {
        obj.opts = opts;
      }
    };
  }

  function post(path, cb) {
    var obj = {path:path, load:cb};
    routes.POST.push(obj);
    return {
      unload: function(unloadCallback) {
        obj.unload = unloadCallback;
      },
      opts: function(opts) {
        obj.opts = opts;
      }
    };
  }

  function error404(fun) {
    fun404 = fun;
  }

  function toRegex(path) {
    if (path.constructor == String) {
      return new RegExp("^" + path.replace(PATH_MATCHER, PATH_REPLACER)
                          .replace(WILD_MATCHER, WILD_REPLACER) +"$");
    } else {
      return path;
    }
  }

  function urlChanged(maintainScroll) {
    history.push(window.location.hash);
    trigger("GET", "#" + (document.location.href.split("#")[1] || ""));
    if (maintainScroll !== true) {
      //window.scrollTo(0,0);
    }
  }

  function forward(url) {
    trigger("GET", url);
  }

  function formSubmitted(e) {

    e.preventDefault();
    var action = e.target.getAttribute("action");

    if (action[0] === "#") {
      trigger("POST", action, e, serialize(e.target));
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
      if (lastPage && lastPage.unload && verb === "GET") {
        lastPage.unload.apply(this, args);
      }
      match.details.load.apply(this, args);
      if (verb === "GET") {
        lastPage = match.details;
      }
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
    for (i = 0; i < arr.length; i++) {
      tmp = path.match(toRegex(arr[i].path));
      if (tmp) {
        return {"match":tmp, "details":arr[i]};
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

  function previous() {

    return history.length > 1 ? history[history.length - 2]: false;
  }

  return { previous : previous
         , forward : forward
         , back    : back
         , get     : get
         , post    : post
         , init    : init
         , matchesCurrent : matchesCurrent
         , error404 : error404
         , params : params };

});