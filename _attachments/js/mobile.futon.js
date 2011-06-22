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


var localData = (function(){
  if (typeof(localStorage) == 'undefined' ) {
    return false;
  }
  return {
    set:function(prop, val){
      localStorage.setItem(prop, JSON.stringify(val));
    },
    get:function(prop, def){
      return JSON.parse(localStorage.getItem(prop)) || def;
    },
    remove:function(prop){
      localStorage.removeItem(prop);
    }
  };
})();


var Renderer = (function() {

  var paneWidth = 0,
      currentOffset = 0,
      current_tpl   = null,
      lastPane  = null;

  $(window).bind("resize", function () {
    paneWidth = $("body").width();
  });
  $(window).resize();

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

  function render(tpl, data, opts) {

    opts = opts || {};
    data = data || {};

    var rendered = Mustache.to_html($("#" + tpl).html(), data),
    $pane = $("<div class='pane'><div class='content'>" + rendered + "</div></div>");

    if (opts.notransition) {

      $pane.css({"left":currentOffset}).appendTo($("#content"));
      if (lastPane) {
        lastPane.remove();
      }
      lastPane = $pane;

    // } else if (transition === 'slideUp') {

    //   $("#content").one("webkitTransitionEnd transitionend", function() {
    //     if (lastPane) {
    //       lastPane.hide();
    //     }
    //   });

    //   slidePane = $pane.addClass("slidepane")
    //     .css({left:currentOffset, top:-$(window).height(), 'z-index': 3})
    //     .appendTo("#content");
    //   transformY(slidePane, $(window).height());

    // } else if (slidePane) {

    //   if (lastPane) {
    //     lastPane.remove();
    //     lastPane = null;
    //   }

    //   $pane.css({"left":currentOffset}).appendTo($("#content"));
    //   transformY(slidePane, 0);
    //   lastPane = $pane;

    //   slidePane.one("webkitTransitionEnd transitionend", function() {
    //     slidePane.remove();
    //     slidePane = null;
    //   });

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

  return {
    render: render
  };
});

var MobileFuton = (function () {

  var mainDb        = document.location.pathname.split("/")[1],
      paneWidth     = 0,
      activeTasks   = null,
      router        = new Router(),
      renderer      = new Renderer(),
      docs          = {},
      replications  = localData.get("replications", []),
      lastPane      = null;

  router.get(/^(!)?$/, function () {
    $("#title").text("CouchDB");
    $.when.apply(this, [$.couch.session({}), $.couch.info()])
      .then(function(data, info) {
        var tpldata = {
          ip:router.params.ip || document.location.hostname,
          port:document.location.port || 80,
          version:info[0].version
        };
        if (data[0].userCtx.roles.indexOf("_admin") != -1) {
          tpldata.adminparty = true;
        }
        renderer.render("home_tpl", tpldata);
      });
  });

  router.get("!/couchapps/", function () {

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
            renderer.render("couchapps_tpl", {couchapps:couchapps});
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
      renderer.render("database_tpl", data);
    });
  });

  router.get("!/databases/:database/*doc", function (database, doc) {
    $.couch.db(database).openDoc(doc).then(function(json) {
      $("#title").text("/" + database + "/" + doc);
      renderer.render("document_tpl", {json:JSON.stringify(json, null, " ")});
    });
  });

  router.get("!/databases/", function () {
    $.couch.allDbs({}).then(function(data) {
      $("#title").text("Databases");
      renderer.render("databases_tpl", {databases:data});
    });
  });

  router.get("!/replication/", function () {
    $.couch.allDbs({}).then(function(data) {
      $("#title").text("Replication");
      renderer.render("replication_tpl", {
        databases:data,
        replications:replications
      });
    });
  });

  router.get("!/config/", function () {
    $("#title").text("Config");
    $.couch.config({error:function() {
      renderer.render("!/config/", "unauthorized_tpl");
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
      renderer.render("config_tpl", {config:html});
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

  router.get("!/tasks/", function () {
    $("#title").text("Active Tasks");
    var slidein = false;
    var showActiveTasks = function() {
      $.couch.activeTasks({error:function(data) {
        clearInterval(activeTasks);
        activeTasks = null;
        renderer.render("unauthorized_tpl");
      }}).then(function(data) {
        renderer.render("tasks_tpl", {tasks:data}, {notransition:slidein});
        slidein = true;
      });
    };
    activeTasks = setInterval(showActiveTasks, 5000);
    showActiveTasks();
  }).unload(function() {
    clearInterval(activeTasks);
    activeTasks = null;
  });


  router.post("!/replication/", function (e, form) {
    if (!replicationExists(form)) {
      replications.push(form);
      localData.set("replications", replications);
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
      if (replications[i].source == data.source &&
          replications[i].target === data.target) {
        return true;
      }
    }
    return false;
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

  router.init();

})();
