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

var MobileFuton = (function () {

  var mainDb        = document.location.pathname.split("/")[1],
      activeTasks   = null,
      router        = new Router(),
      renderer      = new Renderer(),
      docs          = {},
      replications  = localData.get("replications", []);

  router.get(/^(#)?$/, function () {
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

  router.get("#/couchapps/", function () {

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

  router.get("#/databases/:database/", function (database) {
    router.forward("#/databases/" + database + "/views/_all_docs");
  });

  router.get("#/databases/:database/views/*view", function (database, view) {
    database = decodeURIComponent(database);
    var viewname = view.replace("-", "/");
    $("#title").text(database + "/" + viewname);
    $.couch.db(database).allDesignDocs({include_docs:true}).then(function(ddocs) {
      var views = [];
      $.each(ddocs.rows, function(ddoc) {
        var id = ddocs.rows[ddoc].doc._id;
        $.each(ddocs.rows[ddoc].doc.views || [], function(v) {
          views.push({id:id, ddoc:id.replace("_design/", ""), name:v});
        });
      });

      var callback = function(data) {
        data.database = database;
        data.start = 1;
        data.end = data.total_rows;
        data.views = views;
        renderer.render("database_tpl", data, {}, function(tpl) {
          $("#views_select option[value=" + view + "]", tpl).attr("selected", "selected");
          $("#views_select", tpl).bind("change", function() {
            document.location.href = "#/databases/" + database + "/views/" +
              $(this).val();
          });
        });
      };

      if (view === "_all_docs") {
        $.couch.db(database).allDocs({}).then(callback);
      } else if (view === "_design_docs") {
        $.couch.db(database).allDesignDocs({}).then(callback);
      } else {
        $.couch.db(database).view(viewname, {}).then(callback);
      }

    });
  });

  router.get("#/databases/:database/*doc", function (database, doc) {
    database = decodeURIComponent(database);
    $.couch.db(database).openDoc(doc).then(function(json) {
      $("#title").text("/" + database + "/" + doc);
      renderer.render("document_tpl", {json:JSON.stringify(json, null, " ")});
    });
  });

  router.get("#/databases/", function () {
    $.couch.allDbs({}).then(function(data) {
      $("#title").text("Databases");
      data = $.map(data, function(url) {
        return {url:encodeURIComponent(url), name:url};
      });
      renderer.render("databases_tpl", {databases:data});
    });
  });

  router.get("#/replication/", function () {
    $.couch.allDbs({}).then(function(data) {
      $("#title").text("Replication");
      renderer.render("replication_tpl", {
        databases:data,
        replications:replications
      }, {}, function(tpl) {
        $("#clear", tpl).bind('mousedown', function() {
          window.location.reload();
        });
      });
    });
  });

  router.get("#/config/", function () {
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

  router.get("#/tasks/", function () {
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


  router.post("/replication/", function (e, form) {
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

  router.post("#/config/", function (e, form) {
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
