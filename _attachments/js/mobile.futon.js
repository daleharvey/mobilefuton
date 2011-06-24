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

var nil = function() {};

var localData = (function(){
  if (typeof(localStorage) == 'undefined' ) {
    return false;
  }
  return {
    set:function(prop, val){
      localStorage.setItem(prop, JSON.stringify(val));
    },
    get:function(prop, def){
      var obj = localStorage.getItem(prop) || "false";
      return JSON.parse(obj) || def;
    },
    remove:function(prop){
      localStorage.removeItem(prop);
    }
  };
})();

var MobileFuton = (function () {


  var mainDb        = location.pathname.split("/")[1]
    , activeTasks   = null
    , router        = new Router()
    , renderer      = new Renderer()
    , docs          = {}
    , replications  = localData.get("replications", []);


  router.get(/^(#)?$/, function () {
    setTitle("CouchDB");
    getN([$.couch.session(), $.couch.info()]).then(function(data, inf) {
      var tpldata =
          { ip: router.params.ip || location.hostname
          , port: location.port || 80
          , version: (inf[0].version)
          , adminparty: (data[0].userCtx.roles.indexOf("_admin") != -1) }
      renderer.render("home_tpl", tpldata);
    });
  });


  router.get("#/couchapps/", function () {

    var completed = 0
      , couchapps = [];

    function designDocs(database) {
      return $.couch.db(database).allDesignDocs();
    }

    function isCouchApp(ddoc, max) {

      var url = "/" + ddoc.database + "/" + ddoc.ddoc + "/index.html";

      var complete = function(xhr) {
        completed++;
        if (xhr.status === 200) {
          couchapps.push({url:url, name:ddoc.ddoc.split("/")[1]});
        }
        if (completed === max) {
          setTitle("Couchapps");
          renderer.render("couchapps_tpl", {couchapps:couchapps});
        }
      }

      $.ajax({type:"HEAD", url:url, complete: complete});
    }

    $.couch.allDbs({
      success: function(data) {
        getN($.map(data, designDocs)).then(function() {
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
    setTitle(database + "/" + viewname);
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
            location.href = "#/databases/" + database + "/views/" + $(this).val();
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
      setTitle("/" + database + "/" + doc);
      renderer.render("document_tpl", {json:JSON.stringify(json, null, " ")});
    });
  });


  router.get("#/databases/", function () {
    $.couch.allDbs().then(function(data) {
      setTitle("Databases");
      data = $.map(data, function(url) {
        return {url:encodeURIComponent(url), name:url};
      });
      renderer.render("databases_tpl", {databases:data});
    });
  });


  router.get("#/replication/", function () {
    setTitle("Replication");
    $.couch.allDbs({}).then(function(data) {
      renderer.render("replication_tpl", {
        databases: data,
        replications: replications
      }, {}, function(tpl) { setupReplicationEvents(tpl); updateReplications(); });
    });
    activeTasks = setInterval(updateReplications, 5000);
  }).unload(function() { clearInterval(activeTasks); });


  router.get("#/config/", function () {
    setTitle("Config");
    $.couch.config({error:function() {
      renderer.render("!/config/", "unauthorized_tpl");
    }}).then(function(data) {
      var html = "";
      $.each(data, function(id) {
        html += "<ul><li class='header'>" + id + "</li>";
        $.each(data[id], function(opts) {
          html += "<li><label>" + opts +
            "<input type='text' name='" + id + ":" + opts +
            "' value='"+data[id][opts]+"' /></label></li>";
        });
        html += "</ul>";
      });
      renderer.render("config_tpl", {config:html});
    });
  });


  router.get("#/tasks/", function () {
    setTitle("Active Tasks");
    activeTasks = setInterval(showActiveTasks, 5000);
    showActiveTasks(true);
  }).unload(function() { clearInterval(activeTasks); });


  router.post("/replication/", function (e, form) {

    if (!replicationExists(form)) {
      replications.push(form);
      localData.set("replications", replications);
    }

    var obj = { source: form.source
              , target: form.target
              , create_target: true
              , continuous: (form.continuous === "on") };

    $.couch.replicate(form.source, form.target, {error:nil}, obj)
           .then(updateReplications);
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
          changes.push({ section: tmp[0]
                       , key: tmp[1]
                       , value: form[name] });
        }
      });

      getN($.map(changes, setConfig)).then(function() {
        $("#saveconfig").val("Save Config");
      });
    });
  });


  var showActiveTasks = function(transition) {

    var opts = (transition !== true) ? {notransition:true} : {};

    var cancel = function(data) {
      clearInterval(activeTasks);
      renderer.render("unauthorized_tpl");
    };

    $.couch.activeTasks({error:cancel}).then(function(data) {
      renderer.render("tasks_tpl", {tasks:data}, opts);
    });
  };


  function setupReplicationEvents(tpl) {

    $("#source_select, #target_select", tpl).bind('change', function(e) {
      var $select = $(e.target);
      if ($select.val() === "manual") {
        $select.replaceWith("<input type='text' name='" +
                            $select.attr('name')+"' />");
      }
    });

    $("#stored", tpl).bind('mousedown', function(e) {
      if ($(e.target).is(".replication")) {
        var $obj = $(e.target).parent("li");
        $("[name=source]", tpl).replaceWith("<input type='text' name='source' value='"+$obj.attr("data-source")+"' />");
        $("[name=target]", tpl).replaceWith("<input type='text' name='target' value='"+$obj.attr("data-target")+"' />");
        if ($obj.attr("data-continous") === "on") {
          $("#continous", tpl).attr("checked", "checked");
        } else {
          $("#continous", tpl).removeAttr("checked");
        }
      }
    });

    $(".delete", tpl).bind('mousedown', function() {
      var source = ($(this).parents("li").data("source"))
        , target = ($(this).parents("li").data("target"))
        , repl = $.grep(replications, function(obj) {
          return !(obj.source === source && obj.target === target);
        });
      localData.set("replications", repl);
      location.reload(true);
    });

  }


  function replicationExists(data) {
    for(var i = 0; i < replications.length; i++) {
      if (replications[i].source == data.source &&
          replications[i].target === data.target) {
        return true;
      }
    }
    return false;
  }


  var parseReplicationTask = function(task) {

    var parts = (task.replace(/`/g, "").split(/:(.+)?/))
      , where = (parts[1].split("->"))
      , obj = { source: $.trim(where[0])
              , target: $.trim(where[1]) };

    if (parts[0].match("continuous")) {
      obj.continuous = true;
    }

    if (parts[0].match("create_target")) {
      obj.create_target = true;
    }

    return obj;
  };


  var getN = function(arr) {
    return $.when.apply(this, arr);
  };


  var setTitle = function(text) {
    $("#title, title").text(text);
  };


  var updateReplications = function() {

    $.couch.activeTasks({}).then(function(tasks) {

      for(var replTasks = [], i = 0; i < tasks.length; i++) {
        if (tasks[i].type === "Replication") {
          replTasks.push(parseReplicationTask(tasks[i].task));
        }
      }

      var $rows = $(Mustache.to_html($("#replication_items").html(),
                                     {running: replTasks}));

      $(".cancel", $rows).bind('mousedown', function() {

        var parent = ($(this).parents("li"))
          , obj = { source: (parent.data("source"))
                  , target: (parent.data("target"))
                  , cancel: true };

        if (parent.data("continuous") === true) {
          obj.continuous = true;
        }
        if (parent.data("create_target") === true) {
          obj.create_target = true;
        }

        $.couch.replicate(obj.source, obj.target, {}, obj)
               .then(updateReplications)
      });

      $("#running li:not(.header)").remove();
      $rows.insertAfter($("#running li.header"));
    });
  };


  router.init();

})();
