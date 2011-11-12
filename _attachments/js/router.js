var Router = (function() {

  var PATH_REPLACER = "([^\/]+)"
    , PATH_MATCHER = (/:([\w\d]+)/g)
    , WILD_MATCHER = (/\*([\w\d]+)/g)
    , WILD_REPLACER = "(.*?)"
    , preRouterFun  = null
    , lastPage
    , history = []
    , hashparams = {}
    , params = {}
    , routes = {GET: [], POST: []};

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

  function preRouter(fun) {
    preRouterFun = fun;
  };

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

  function toRegex(path) {
    if (path.constructor == String) {
      return new RegExp("^" + path.replace(PATH_MATCHER, PATH_REPLACER)
                          .replace(WILD_MATCHER, WILD_REPLACER) +"$");
    } else {
      return path;
    }
  }

  function refresh() {
    urlChanged(null, {"router": {"refresh": true}});
  }

  function urlChanged(e, opts) {
    opts = opts || {};
    history.push("#" + (document.location.href.split("#")[1] || ""));
    trigger("GET", "#" + (document.location.href.split("#")[1] || ""), null, null, opts);
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

  function trigger(verb, url, ctx, data, opts) {

    if (preRouterFun) {
      if (!preRouterFun(verb, url, ctx)) {
        return;
      }
    }

    opts = opts || {};
    hashparams = [];

    $.each((url.split("?")[1] || "").split("&"), function(i, param) {
      var tmp = param.split("=");
      hashparams[tmp[0]] = tmp[1];
    });

    var match = matchPath(verb, url.split("?")[0]);

    if (match) {

      var args = match.match.slice(1);

      if (verb === "POST") {
        args.unshift(data);
        args.unshift(ctx);
      }

      if (lastPage && lastPage.unload && verb === "GET") {
        lastPage.unload.apply(this, args);
      }

      var opq = $.extend({}, opts, match.details.opts);
      var isBack = (history.length > 2 && url === history[history.length-3]);

      if (isBack) {
        opq.router = opq.router || {};
        opq.router.back = true;
        history.length -= 2;
      }

      if (match.match[0] === "#/") {
        opq.router = opq.router || {};
        opq.router.home = true;
      }

      args.unshift(opq);
      match.details.load.apply(this, args);
      if (verb === "GET") {
        lastPage = match.details;
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

  function previous(x) {
    x = x || 0;
    return history.length > (1 + x) ? history[history.length - (2 + x)]: false;
  }

  function hashparam(key) {
    return hashparams[key];
  }

  return {
    previous : previous,
    refresh : refresh,
    forward : forward,
    back    : back,
    get     : get,
    post    : post,
    init    : init,
    matchesCurrent : matchesCurrent,
    hashparam : hashparam,
    params : params,
    pre     : preRouter
  };

});