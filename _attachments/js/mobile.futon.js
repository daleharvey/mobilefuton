window.log = function(){
  log.history = log.history || [];
  log.history.push(arguments);
  if(this.console){
    console.log( Array.prototype.slice.call(arguments) );
  }
};

$.ajaxSetup({
  cache: false
});

// Doesnt handle ghosted events, will survive for now
var pressed = Utils.isMobile() ? "click" : "click";

var Tasks = (function () {

  var mainDb  = document.location.pathname.split("/")[1],
      paneWidth = 0,
      isMobile = Utils.isMobile(),
      router  = new Router(),
      current_tpl = null,
      slidePane = null,
      docs    = {},
      tasks   = [],
      servers = [],
      zIndex  = 0,
      currentOffset = 0,
      lastPane = null,
      $db     = $.couch.db(mainDb);

  var params = {};
  $.each(document.location.search.slice(1).split("&"), function(i, param) {
    var tmp = param.split("=");
    params[tmp[0]] = tmp[1];
  });

  var templates = {
    home_tpl : {
      transition : "slideHorizontal",
      events : {
      },
      init : function(dom) {
      }
    }
  };

  router.get(/^(!)?$/, function () {
    $("#title").text("CouchDB");
    render(/^(!)?$/, "home_tpl", {ip:params.ip || "127.0.0.1", port:document.location.port});
  });

  router.get("!/couchapps/", function () {

    //
    var completed = 0;
    var couchapps = [];

    function designDocs(database) {
      return $.couch.db(database).allDesignDocs();
    }

    function isCouchApp(ddoc, max) {
        var url = "/" + ddoc.database + "/" + ddoc.ddoc + "/index.html";
        $.ajax({
            type:"HEAD",
            url:url,
            complete: function(xhr) {
                completed++;
                if (xhr.status === 200) {
                    couchapps.push({url:url, name:ddoc.ddoc.split("/")[1]});
                }
                if (completed === max) {
                    $("#title").text("Couchapps");
                    render("!/couchapps/", "couchapps_tpl", {couchapps:couchapps});
                }
            }
        });
    }

    $.couch.allDbs({
      success: function(data) {
        $.when.apply(this, $.map(data, designDocs)).then(function() {
            var designDocs = [];
            $.each(arguments, function(id, ddocs) {
                $.each(ddocs[0].rows, function(ddocid, ddoc) {
                    designDocs.push({database:data[id], ddoc:ddoc.id});
                });
            });

            $.map(designDocs, function(ddoc) {
                isCouchApp(ddoc, designDocs.length);
            });

        });
      }
    });
  });

  router.get("!/databases/:database/", function (database) {
    $.couch.db(database).allDocs({}).then(function(data) {
      $("#title").text(database);
      data.start = 1;
      data.end = data.total_rows;
      render("!/databases/"+database+"/", "database_tpl", data);
    });
  });

  router.get("!/databases/", function () {
    $.couch.allDbs({
      success: function(data) {
        $("#title").text("Databases");
        render("!/databases/", "databases_tpl", {databases:data});
      }
    });
  });

  router.get("!/replication/", function () {
    $.couch.allDbs({
      success: function(data) {
        $("#title").text("Replication");
        render("!/replication/", "replication_tpl", {databases:data});
      }
    });
  });

  function render(url, tpl, data) {

   if (router.matchesCurrent(url) === null) {
      return;
    }

    data = data || {};
    $("body").removeClass(current_tpl).addClass(tpl);

    var rendered = Mustache.to_html($("#" + tpl).html(), data),
    $pane = $("<div class='pane'><div class='content'>" + rendered + "</div></div>");

    // Bind this templates events
    var events = templates[tpl] && templates[tpl].events;
    if (events) {
      for (var key in events) {
        $(key, $pane).bind(events[key].event + ".custom", events[key].callback);
      }
    }

    if (templates[tpl] && templates[tpl].init) {
      templates[tpl].init($pane);
    }

    var transition = templates[tpl] && templates[tpl].transition;

    if (transition === 'slideUp') {

      $("#content").one("webkitTransitionEnd transitionend", function() {
        if (lastPane) {
          lastPane.hide();
        }
      });

      slidePane = $pane.addClass("slidepane")
        .css({left:currentOffset, top:-$(window).height(), 'z-index': 3})
        .appendTo("#content");
      transformY(slidePane, $(window).height());

    } else if (slidePane) {

      if (lastPane) {
        lastPane.remove();
        lastPane = null;
      }

      $pane.css({"left":currentOffset}).appendTo($("#content"));
      transformY(slidePane, 0);
      lastPane = $pane;

      slidePane.one("webkitTransitionEnd transitionend", function() {
        slidePane.remove();
        slidePane = null;
      });

    } else {

      if (current_tpl) {
        currentOffset += true ? paneWidth : -paneWidth;
      }

      var tmp = lastPane;
      $("#content").one("webkitTransitionEnd transitionend", function() {
        if (tmp) {
          tmp.remove();
          tmp = null;
        }
      });

      transformX($pane, currentOffset);
      $pane.appendTo($("#content"));

      transformX($("#content"), -currentOffset);
      lastPane = $pane;
    }
    current_tpl = tpl;
  }

  function transformY(dom, x) {
    if (Modernizr.csstransforms3d) {
      dom.css("-moz-transform", "translate3d(0, " + x + "px, 0)")
        .css("-webkit-transform", "translate3d(0, " + x + "px, 0)");
    } else {
      dom.css("-moz-transform", "translate(0, " + x + "px)")
        .css("-webkit-transform", "translate(0, " + x + "px)");
    }
  }

  function transformX(dom, x) {
    if (Modernizr.csstransforms3d) {
      dom.css("-moz-transform", "translate3d(" + x + "px, 0, 0)")
        .css("-webkit-transform", "translate3d(" + x + "px, 0, 0)");
    } else {
      dom.css("-moz-transform", "translate(" + x + "px, 0)")
        .css("-webkit-transform", "translate(" + x + "px, 0)");
    }
  }

  $(window).bind("resize", function () {
    paneWidth = $("body").width();
  });
  $(window).resize();

  router.init();

})();
