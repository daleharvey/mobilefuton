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
      replications = localStorage.replications && JSON.parse(localStorage.replications) || [],
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
    $.couch.session({}).then(function(data) {
      var tpldata = {
        ip:params.ip || document.location.hostname,
        port:document.location.port || 80
      };
      if (data.userCtx.roles.indexOf("_admin") != -1) {
        tpldata.adminparty = true;
      }
      console.log(tpldata);
      render(/^(!)?$/, "home_tpl", tpldata);
    });
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
      data.database = database;
      data.start = 1;
      data.end = data.total_rows;
      render("!/databases/"+database+"/", "database_tpl", data);
    });
  });

  router.get("!/databases/:database/*doc", function (database, doc) {
    $.couch.db(database).openDoc(doc).then(function(json) {
      $("#title").text("/" + database + "/" + doc);
      render("!/databases/"+database+"/" + doc, "document_tpl", {json:JSON.stringify(json, null, " ")});
    });
  });

  router.get("!/databases/", function () {
    $.couch.allDbs({}).then(function(data) {
      $("#title").text("Databases");
      render("!/databases/", "databases_tpl", {databases:data});
    });
  });

  router.get("!/replication/", function () {
    $.couch.allDbs({}).then(function(data) {
      $("#title").text("Replication");
      render("!/replication/", "replication_tpl", {databases:data, replications:replications});
    });
  });

  router.get("!/config/", function () {
    $("#title").text("Config");
    $.couch.config({error:function() {
      render("!/config/", "unauthorized_tpl");
    }}).then(function(data) {
      var html = "";
      $.each(data, function(id) {
        html += "<ul><li class='header'>" + id + "</li>";
        $.each(data[id], function(opts) {
          html += "<li><label>" + opts +
            "<input type='text' name='" + id + ":" + opts +
            "' value='"+data[id][opts]+"' /></li>";
        });
        html += "</ul>";
      });
      render("!/config/", "config_tpl", {config:html});
    });
  });

  router.post("/config/", function (e, form) {

    $("#saveconfig").val("Saving ...");

    function setConfig(obj) {
      return $.couch.config({}, obj.section, obj.key, obj.value);
    }

    $.couch.config().then(function(data) {
      var changes = [];
      $.each(form, function(name) {
        var tmp = name.split(":");
        if (data[tmp[0]][tmp[1]] != form[name]) {
          changes.push({
            section: tmp[0],
            key: tmp[1],
            value: form[name]
          });
        }
      });

      $.when.apply(this, $.map(changes, setConfig)).then(function() {
        $("#saveconfig").val("Save Config");
      });
    });
  });

  router.post("!/replication/", function (e, form) {
    if (!replicationExists(form)) {
      replications.push(form);
      localStorage.replications = JSON.stringify(replications);
    }
    var reOpts = {create_target:true};
    if (form.continous == "on") {
      reOpts.continous = true;
    }
    $.couch.replicate(form.source, form.target, {}, reOpts).done(function() {
      alert("Replication Successful");
    }).fail(function() {
      alert("Replication Failed");
    });
  });

  function replicationExists(data) {
    for(var i = replications.length; i < replications.length; i++) {
      if (replications[i].source == data.source && replications[i].target === data.target) {
        return true;
      }
    }
    return false;
  }

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

  $("#stored").live('mousedown', function(e) {
    if ($(e.target).is(".replication")) {
      var $obj = $(e.target).parent("li");
      $("[name=source]").replaceWith("<input type='text' name='source' value='"+$obj.attr("data-source")+"' />");
      $("[name=target]").replaceWith("<input type='text' name='target' value='"+$obj.attr("data-target")+"' />");
      if ($obj.attr("data-continous") === "on") {
        $("#continous").attr("checked", "checked");
      } else {
        $("#continous").removeAttr("checked");
      }
    }
  });

  $("select").live('change', function(e) {
    var $select = $(e.target);
    if ($select.attr('id') == "source_select" || $select.attr('id') === "target_select") {
      if ($select.val() === "manual") {
        $select.replaceWith("<input type='text' name='"+$select.attr('name')+"' />");
      }
    }
  });

  $(window).bind("resize", function () {
    paneWidth = $("body").width();
  });
  $(window).resize();

  router.init();

})();
