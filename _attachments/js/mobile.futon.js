

// http://paulirish.com/2009/log-a-lightweight-wrapper-for-consolelog/
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


// jquery.couch.js needs some callbacks nullified to prevent defaults
var nil = function() {};


// Basic wrapper for localStorage
var localData = (function(){
  if (!localStorage) {
    return false;
  }
  return {
    set:function(prop, val) {
      localStorage.setItem(prop, JSON.stringify(val));
    },
    get:function(prop, def) {
      return JSON.parse(localStorage.getItem(prop) || 'false') || def;
    },
    remove:function(prop) {
      localStorage.removeItem(prop);
    }
  };
})();


// http://yehudakatz.com/2009/04/20/evented-programming-with-jquery/
function $$(node) {
  var data = $(node).data("$$");
  if (data) {
    return data;
  } else {
    data = {};
    $(node).data("$$", data);
    return data;
  }
};


var MobileFuton = (function () {

  var mainDb = location.pathname.split("/")[1]
    , interval = null
    , router = Router()
    , renderer = Renderer()
    , docs = {}
    , replications = localData.get('replications', [])
    , clearRefresh = function() { clearInterval(interval); };


  router.get(/^(#)?$/, function (rtr) {
    setTitle('CouchDB');
    $.couch.info().then(function(info) {
      var tpldata =
          { ip: router.params.ip || location.hostname
          , port: location.port || 80
          , version: (info.version)
          , adminparty: isAdminParty() }
      renderer.render('home_tpl', tpldata, rtr);
    });
  }).opts({"foo":"bar"});


  router.get('#/couchapps/', function(rtr) {

    setTitle('Couchapps');

    var completed = 0
      , couchapps = [];

    function designDocs(database) {
      return $.couch.db(database).allDesignDocs();
    }

    function isCouchApp(ddoc, max) {

      var url = '/' + ddoc.database + '/' + ddoc.ddoc + '/index.html';

      var complete = function(xhr) {
        completed++;
        if (xhr.status === 200) {
          couchapps.push({url:url, name:ddoc.ddoc.split('/')[1]});
        }
        if (completed === max) {
          renderer.render('couchapps_tpl', {couchapps:couchapps}, rtr);
        }
      }

      $.ajax({type:'HEAD', url:url, complete: complete});
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


  router.get('#/db/:database/', function (rtr, database) {

    var dbname = decodeURIComponent(database)
      , views = []
      , $db = $.couch.db(dbname)
      , allDocs = $db.allDesignDocs({include_docs:true});

    setTitle(dbname);

    $.when.apply(this, [$db.info(), allDocs]).then(function(info, ddocs) {
      ddocs = ddocs[0];
      info = info[0];
      $.each(ddocs.rows, function(ddoc) {
        id = ddocs.rows[ddoc].doc._id;
        $.each(ddocs.rows[ddoc].doc.views || [], function(v) {
          views.push({id:id, ddoc:id.replace('_design/', ''), name:v});
        });
      });

      var data = { views: views
                 , db: database
                 , doc_count: info.doc_count
                 , update_seq: info.update_seq
                 , disk_size: Utils.formatSize(info.disk_size) };

      renderer.render('database_tpl', data, rtr);
    });
  });


  router.get('#/db/:database/_create_doc/', function (rtr, db) {
    renderer.render('create_doc_tpl', {db:db}, rtr);
  });


  router.get('#/db/:database/_delete/', function (rtr, db) {
    var data = { action: "#delete_database"
               , cancel: "#/db/" + db + "/"
               , notice: "delete the database " + db
               , action_btn: "Delete"
               , form: [{key:"db", value:db}] };
    renderer.render('confirm_tpl', data, rtr);
  });


  router.get('#/db/:db/views/*view', function (rtr, db, view) {

    var dbname = decodeURIComponent(db)
      , viewname = view.replace('-', '/')
      , id = null
      , opts = {limit: (view === "_design_docs" ? 99 : 11)}
      , paginate = (view !== "_design_docs");

    if (router.hashparam("startkey")) {
      opts.startkey = JSON.parse(decodeURIComponent(router.hashparam("startkey")));
    }
    if (router.hashparam("descending")) {
      opts.descending = true;
    }

    setTitle(viewname);

    var callback = function(data) {

      var rows = $.map(data.rows, function(obj) {
        obj.name = encodeURIComponent(obj.id);
        obj.display = JSON.stringify(obj.key, null, ' ') + "<span class='jsonval'>" +
          JSON.stringify(obj.value) + "</span>";
        return obj;
      });

      var backkey = data.rows[0];

      if (router.hashparam("descending")) {
        rows.reverse();
        data.offset = data.total_rows - (data.offset + opts.limit);
        backkey = data.rows[data.rows.length-1];
      }

      data.offset = data.offset || 0;
      data.total_rows = data.total_rows || 0;

      var end = ((data.offset + opts.limit - 1) > data.total_rows)
        , max = end ? data.total_rows : data.offset + opts.limit - 1
        , tmp = (end ? data.rows[data.rows.length-1] : rows.pop())
        , startkey = tmp && JSON.stringify(tmp.key);

      renderer.render('database_view_tpl', { db: dbname
                                           , hasNext: !end
                                           , hasBack: data.offset > 1 && paginate
                                           , view: view
                                           , start: data.offset + 1
                                           , end: max
                                           , rows: rows
                                           , total:data.total_rows
                                           , backkey: tmp && JSON.stringify(backkey.key)
                                           , startkey: startkey}, rtr);
    };

    if (view === '_all_docs') {
      $.couch.db(db).allDocs(opts).then(callback);
    } else if (view === '_design_docs') {
      $.couch.db(db).allDesignDocs(opts).then(callback);
    } else {
      $.couch.db(db).view(viewname, opts).then(callback);
    }
  });


  router.get('#/db/:db/:doc/:key/_delete/', function (rtr, db, doc, key) {

    var keys = key.split(".");
    keys.pop();

    var backkey = (keys.length > 0 ? keys.join(".") + "/" : "")
      , back = "#/db/" + db + "/" + doc + "/" + backkey
      , data = { action: "#delete_key"
               , cancel: "#/db/" + db + "/" + doc + "/"
               , notice: "delete " + key + " from " + doc
               , action_btn: "Delete"
               , form: [ {key:"db", value:db}
                       , {key:"doc", value:doc}
                       , {key:"key", value:key}
                       , {key:"back", value:back} ]};
    renderer.render('confirm_tpl', data, rtr);
  });


  router.get('#/db/:db/:doc/_delete/', function(rtr, db, doc) {
    var back = (router.previous(1) || "#/db/" + db + "/")
      , data = { action: "#delete_doc"
               , cancel: "#/db/" + db + "/"
               , notice: "delete the document " + doc
               , action_btn: "Delete"
               , form: [ {key:"db", value:db}
                       , {key:"doc", value:doc}
                       , {key:"back", value:back} ]};
    renderer.render('confirm_tpl', data, rtr);
  });

  router.get('#/db/:db/:doc/', function (rtr, db, doc) {
    router.forward('#/db/' + db + '/' + doc + '/rev/current/', {}, rtr);
  });

  router.get('#/db/:db/:doc/rev/:rev/:key/', function (rtr, db, doc, rev, key) {

    var opts = ((rev === "current") ? {} : {rev: rev})
      , docId = decodeURIComponent(doc);

    setTitle(docId);
    db = decodeURIComponent(db);

    $.couch.db(db).openDoc(docId, opts).then(function(json) {

      var keys = []
        , data = fetchObj(key.split(":"), json);

      for (var obj in data) {
        keys.push({ key: obj
                  , terminal: (typeof data[obj] !== "object")
                  , value: JSON.stringify(data[obj], null, ' ')
                  , url: key + ":" + encodeURIComponent(obj)});
      }

      if ((typeof data !== "object" || keys.length === 0) && rev === "current") {
        renderer.render('edit_key_tpl', { db: db
                                        , key: key
                                        , value: JSON.stringify(data)
                                        , doc:doc
                                        , rev: rev
                                        , keys: keys}, rtr);

      } else {
        var canedit = true
          , preview = ""
          , tmp = key.split(":");
        if (tmp[0] === "_attachments" && tmp.length > 1) {
          canedit = false;
          if (/(image\/png|image\/jpeg|image\/jpg)/.test(data.content_type)) {
            preview = '<img src="/' + db + '/' + docId + '/' +
              decodeURIComponent(tmp[1]).replace(":", "/") + '" />';
          }
        }
        renderer.render('document_tpl', { db: db
                                        , canedit: canedit
                                        , preview: preview
                                        , doc:doc
                                        , rev: rev
                                        , key: key
                                        , optkey: "/" + key
                                        , keys: keys}, rtr, addDocEvents);
      }
    });
  });


  router.get('#/db/:db/:doc/rev/:rev/', function (rtr, db, doc, rev) {

    var docId = decodeURIComponent(doc);
    setTitle(doc);
    db = decodeURIComponent(db);

    var opts = {revs_info:true};
    if (rev !== "current") {
      opts.rev = rev;
    }

    $.couch.db(db).openDoc(docId, opts).then(function(json) {
      var keys = []
        , revs = $.map(json._revs_info || [], function(obj) {
          return {rev:obj.rev, available:obj.status === "available"};
        });
      delete json._revs_info;
      $.each(json, function(obj) {
        keys.push({ key: obj
                  , value: JSON.stringify(json[obj], null, ' ')
                  , url: obj});
      });
      renderer.render('document_tpl', { db: db
                                      , canedit: true
                                      , doc:doc
                                      , keys: keys
                                      , rev: rev
                                      , json:JSON.stringify(json, null, ' ')
                                      , hasrevisions: revs.length > 0
                                      , revisions: revs }, rtr, addDocEvents);
    });
  });


  router.get('#/db/', function(rtr) {
    setTitle('Databases');
    $.couch.allDbs().then(function(data) {
      data = $.map(data, function(url) {
        return {url:encodeURIComponent(url), name: url};
      });
      renderer.render('databases_tpl', {databases: data}, rtr);
    });
  });


  router.get('#/replication/', function(rtr) {
    setTitle('Replication');
    $.couch.allDbs({}).then(function(data) {
      renderer.render('replication_tpl', {
        databases: data,
        replications: replications
      }, rtr, function(tpl) { setupReplicationEvents(tpl); updateReplications(); });
    });
    interval = setInterval(updateReplications, 5000);
  }).unload(clearRefresh);


  router.get('#/config/', function(rtr) {

    setTitle('Config');

    var html = ''
      , header = '<ul><li class="header">{{id}}</li>'
      , item = '<li><label>{{name}}<br /><div class="inputwrap">' +
      '<input type="text" name=\'{{id}}:{{{name}}}\' value=\'{{{value}}}\' />' +
      '</div></label></li>'

    $.couch.config({error:unauth}).then(function(data) {
      $.each(data, function(id) {
        html += Mustache.to_html(header, {id:id});
        $.each(data[id], function(opts) {
          html += Mustache.to_html(item, {name:opts, id:id, value:data[id][opts]});
        });
        html += '</ul>';
      });
      renderer.render('config_tpl', {config:html}, rtr);
    });
  });


  router.get('#/tasks/', function(rtr) {
    setTitle('Active Tasks');
    $.couch.activeTasks({error: unauth}).then(function(data) {
      renderer.render('tasks_tpl', {tasks: data}, rtr);
    });
    interval = setInterval(updateActiveTasks, 5000);
  }).unload(clearRefresh);


  router.get('#/account/', function(rtr) {
    var user = $$("#user").user;
    user.roles = user.roles.toString();
    if (user.name) {
      renderer.render('logged_in', user, rtr);
    } else {
      renderer.render('logged_out', {}, rtr);
    }
  });


  router.post('#create_doc', function (_, e, form) {
    var obj = parseJSON(form.value || "{}");
    if (typeof obj !== "object" || $.isArray(obj)) {
      obj = {};
    }
    if (form.id) {
      obj._id = form.id;
    }
    $.couch.db(form.db).saveDoc(obj).then(function(res) {
      location.href = "#/db/" + form.db + "/" + res.id + "/";
    });
  });


  router.post('#logout', function (_, e, form) {
    $.couch.logout().then(refreshSession);
  });


  router.post('#login', function (_, e, form) {

    var login = function() {
      $.couch.login(
        { name: form.username
        , password: form.password
        , success: refreshSession }
      );
    };

    if (form.register && isAdminParty()) {
      $.couch.config({success: login}, "admins", form.username, form.password);
    } else if (form.register) {
      $.couch.signup({name:form.username}, form.password, {success: login});
    } else {
      login();
    }
  });


  router.post('#addkey', function (_, e, form) {
    $('#addkeybtn').val('Saving ...');
    $.couch.db(form.db).openDoc(form.doc).then(function(json) {
      for(var tmp=json, keys=form.key.split(":"), i=0; i < keys.length; i++) {
        tmp = tmp[keys[i]];
      }
      if (typeof form["key[]"] === "string") {
        tmp[form["key[]"]] = parseJSON(form["value[]"]);
      } else {
        for(var x = 0; x < form["key[]"].length-1; x++) {
          tmp[form["key[]"][x]] = parseJSON(form["value[]"][x]);
        }
      }
      $.couch.db(form.db).saveDoc(json).then(function(json) {
        router.refresh();
      });
    });
  });


  router.post('#savekey', function (_, e, form) {
    $('#savekey').val('Saving ...');
    $.couch.db(form.db).openDoc(form.doc).then(function(json) {
      for(var tmp = json, keys = form.key.split(":"), i = 0; i < keys.length-1; i++) {
        tmp = tmp[keys[i]];
      }
      tmp[keys[keys.length-1]] = parseJSON(form.value);
      $.couch.db(form.db).saveDoc(json).then(function(json) {
        $('#savekey').val('Save');
        router.refresh();
      });
    });
  });


  router.post('#replication', function (_, e, form) {

    var obj = { source: form.custom_source || form.source
              , target: form.custom_target || form.target
              , create_target: true
              , continuous: (form.continuous === 'on') };

    $.couch.replicate(form.source, form.target, {error:nil}, obj)
           .then(updateReplications);

    replications = $.grep(replications, function(repl) {
      return !(repl.source === obj.source && repl.target === obj.target);
    });
    replications.push(obj);
    localData.set('replications', replications);
  });


  router.post('#config', function (_, e, form) {

    $('#saveconfig').val('Saving ...');

    function setConfig(obj) {
      return $.couch.config({}, obj.section, obj.key, obj.value);
    }

    $.couch.config().then(function(data) {
      var changes = [];
      $.each(form, function(name) {
        var tmp = name.split(':');
        if (data[tmp[0]][tmp[1]] != form[name]) {
          changes.push({ section: tmp[0]
                       , key: tmp[1]
                       , value: form[name] });
        }
      });

      $.when.apply(this, $.map(changes, setConfig)).then(function() {
        $('#saveconfig').val('Save Config');
      });
    });
  });


  router.post('#delete_database', function (_, e, form) {
    $.couch.db(form.db).drop().then(function() {
      location.href = "#/db/";
    });
  });


  router.post('#delete_key', function (_, e, form) {
    $.couch.db(form.db).openDoc(form.doc).then(function(json) {
      for(var tmp = json, keys = form.key.split(":"), i = 0; i < keys.length-1; i++) {
        tmp = tmp[keys[i]];
      }
      delete tmp[keys[keys.length-1]];
      $.couch.db(form.db).saveDoc(json).then(function(json) {
        location.href = form.back;
      });
    });
  });


  router.post('#delete_doc', function (_, e, form) {
    $.couch.db(form.db).openDoc(form.doc).then(function(doc) {
      $.couch.db(form.db).removeDoc(doc).then(function() {
        location.href = form.back;
      });
    });
  });


  function setTitle(text) {
    $('#title, title').text(text);
  };


  function unauth() {
    clearRefresh();
    renderer.render('unauthorized_tpl');
  };


  function updateActiveTasks(transition) {
    $.couch.activeTasks({error: unauth}).then(function(data) {
      var $html = $(render('#tasks_tpl', {tasks: data}));
      $('#tasks').replaceWith($html);
    });
  };


  function setupReplicationEvents(tpl) {

    $('.replication', tpl).bind('mousedown', function(e) {
      var $obj = $(e.target).parent('li');
      $('#custom_source', tpl).val($obj.attr("data-source"));
      $('#custom_target', tpl).val($obj.attr("data-target"));
      if ($obj.data('continuous')) {
        $('#continuous', tpl).attr('checked', 'checked');
      } else {
        $('#continuous', tpl).removeAttr('checked');
      }
    });

    $('.delete', tpl).bind('mousedown', function() {
      var parent = ($(this).parents('li'))
        , source = parent.data('source')
        , target = parent.data('target');

      replications = $.grep(replications, function(obj) {
        return !(obj.source === source && obj.target === target);
      });
      localData.set('replications', replications);
      router.refresh();
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


  function parseReplicationTask(task) {

    var parts = (task.replace(/`/g, "").split(/:(.+)?/))
      , where = (parts[1].split("->"))
      , obj = { source: $.trim(where[0])
              , target: $.trim(where[1]) };

    if (parts[0].match('continuous')) {
      obj.continuous = true;
    }

    if (parts[0].match('create_target')) {
      obj.create_target = true;
    }

    return obj;
  };


  function updateReplications() {

    var err = function() {
      clearRefresh();
      $('#running li:not(.header)').remove();
      $("#running").append('<li class="none">You need to be an admin to ' +
                           'read current tasks</li>');
    };

    $.couch.activeTasks({error:err}).then(function(tasks) {

      for(var replTasks = [], i = 0; i < tasks.length; i++) {
        if (tasks[i].type === 'Replication') {
          var tmp = parseReplicationTask(tasks[i].task);
          tmp.cancellable = !(/\*/.test(tmp.source + tmp.target));
          replTasks.push(tmp);
        }
      }

      var $rows = $(render('#replication_items', {running: replTasks}));

      $('.cancel', $rows).bind('mousedown', function() {

        var parent = ($(this).parents('li'))
          , obj = { source: (parent.data('source'))
                  , target: (parent.data('target'))
                  , cancel: true };

        if (parent.data('continuous') === true) {
          obj.continuous = true;
        }
        if (parent.data('create_target') === true) {
          obj.create_target = true;
        }

        $.couch.replicate(obj.source, obj.target, {}, obj)
               .then(updateReplications)
      });

      $('#running li:not(.header)').remove();
      $rows.insertAfter($('#running li.header'));
    });
  };


  function render(tpl, data) {
    return Mustache.to_html($(tpl).html(), data);
  }


  function renderTo(dom, tpl, data) {
    $(dom).empty().append(render(tpl, data));
  }


  function refreshSession() {
    updateSession(function() {
      location.href = router.previous() || "#";
    });
  }


  function updateSession(callback) {
    $.couch.session().then(function(data) {
      $$("#user").user = data.userCtx;
      renderLogin();
      if (callback) {
        callback();
      }
    });
  }


  function renderLogin() {
    var user = $$("#user").user;
    if (user.name) {
      renderTo("#user", "#logged_in_btn", user);
    } else {
      renderTo("#user", "#logged_out_btn");
    }
  }


  function  isAdminParty() {
    return !$$("#user").user.name &&
      $$("#user").user.roles.indexOf('_admin') != -1;
  }


  function fetchObj(keyArr, obj) {
    for(var tmp = obj, i = 0; i < keyArr.length; i++) {
      tmp = tmp[decodeURIComponent(keyArr[i])];
    }
    return tmp;
  }


  function parseJSON(json) {
    try {
      return JSON.parse(json);
    } catch(err) {
      return json;
    }
  }


  function addDocEvents(tpl) {
    $("#addkey", tpl).bind('mousedown', function() {
      if ($("#addkeylist").children().length === 0) {
        $("#addkeylist").append('<li class="header">New JSON<li>');
        $("#addkeyform").append('<input type="submit" value="Save" id="addkeybtn" />');
      }

      var html = '<li class="selectwrapper"><input placeholder="key" type="text" name="key[]" /></li><li><textarea placeholder="value" name="value[]"></textarea></li>';
      $("#addkeylist").append(html);
    });
  };

  updateSession(function() {
    router.init(window);
  });

})();
