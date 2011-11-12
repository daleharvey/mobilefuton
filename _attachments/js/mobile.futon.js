

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


function makeLinksFast($dom) {
  $("a", $dom).each(function() {
    var link = $(this).attr('href');
    if (link) {
      new google.ui.FastButton(this, function(e) {
        document.location = link;
        e.stopPropagation();
        e.preventDefault();
      });
    }
  });
}

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

  var mainDb = location.pathname.split("/")[1];
  var interval = null;
  var router = Router();
  var renderer = Renderer();
  var docs = {};
  var clearRefresh = function() { clearInterval(interval); };
  var version;
  var dialog;
  var $content = $('#wrapper');

  router.pre(function(_, url) {

    var css = url.slice(1).split('/').join(' ');
    $content.attr('class', css === ' ' ? 'home' : css);

    if (dialog) {
      renderer.blockTransition();
      dialog.remove();
      dialog = null;
    }
    return true;

  });

  router.get(/^#(\/)?$/, function (rtr) {
    setTitle('Mobile Futon');
    var tpldata ={
      ip: router.params.ip || location.hostname,
      port: location.port || 80,
      version: version.version,
      adminparty: isAdminParty()
    };
    renderer.render('home_tpl', tpldata, rtr);
  });

  router.get('#/login/', function (rtr) {
    var user = $$("#user").user;
    if (user.name) {
      document.location.hash = '#/';
      return;
    }

    dialog = $(render($("#logged_out"), {}));
    dialog.find('.close').bind('click', function() {
      dialog.remove();
      document.location.hash = router.previous(0) || '#/';
    });
    $("body").append(dialog);
  });


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
          couchapps.push({
            url:url,
            name:ddoc.database + "/" + ddoc.ddoc.split('/')[1]
          });
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

    var dbname = decodeURIComponent(database);
    var views = [];
    var $db = $.couch.db(dbname);
    var allDocs = $db.allDesignDocs({include_docs:true});

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

      var data = {
        views: views,
        db: database,
        doc_count: info.doc_count,
        update_seq: info.update_seq,
        disk_size: Utils.formatSize(info.disk_size)
      };

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


  router.get('#/db/:database/_compact/', function (rtr, db) {
    var data = { action: "#compact_database"
               , cancel: "#/db/" + db + "/"
               , notice: "compact the database " + db
               , action_btn: "Compact"
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
        obj.display = JSON.stringify(obj.key, null, ' ') +
          " <span class='jsonval'>" + JSON.stringify(obj.value) + "</span>";
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

  router.get('#/db/:db/changes', function(rtr, db) {
    $.couch.db(db).getDbProperty('_changes', {since: 0}).then(function(data) {
      $.each(data.results, function(i) {
        data.results[i].changes_string = JSON.stringify(data.results[i].changes);
      });
      renderer.render('changes_tpl', data, rtr);
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
    $.couch.allDbs({}).then(function(dbs) {
      renderer.render('replication_tpl', {
        databases: dbs
      }, rtr, function(tpl) {
        updateReplications();
      });
    });
    interval = setInterval(updateReplications, 5000);
  }).unload(clearRefresh);


  router.get('#/replication/:id', function(rtr, id) {
    setTitle('Replication');
    displayReplicationDoc(id, rtr);
    interval = setInterval(function() {
      displayReplicationDoc(id);
    }, 5000);
  }).unload(clearRefresh);


  router.get('#/config/', function(rtr) {

    setTitle('Config');

    $.couch.config({error:unauth}).then(function(data) {
      var sections = [];
      $.each(data, function(id) { sections.push(id); });
      renderer.render('config_top_tpl', {config:sections}, rtr);
    });

  });


  router.get('#/config/:section/', function(rtr, section) {

    setTitle('Config');

    $.couch.config({error:unauth}).then(function(data) {
      var items = [];
      $.each(data[section], function(id) {
        items.push({key:id, value:data[section][id].replace(/"/g, '&quot;')});
      });
      renderer.render('config_section_tpl', {items:items, section:section}, rtr);
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


  router.post('#create_db', function (_, e, form) {
    $.couch.db(form.name).create({}).then(function() {
      location.href = "#/db/" + form.name + "/";
    });
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
      $.couch.login({
        name: form.username,
        password: form.password,
        success: function() {
          updateSession(function() {
            if (dialog) { dialog.remove(); }
            document.location.hash = router.previous(0) || '#/';
          });
        }
      });
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

    var obj = {
      source: form.custom_source || form.source,
      target: form.custom_target || form.target,
      create_target: true,
      continuous: (form.continuous === 'on'),
    };

    if (form.persist === 'on') {
      obj.user_ctx = $$("#user").user;
      $.couch.replicator(null, null, {error:nil}, obj).then(updateReplications);
    } else {
      $.couch.replicate(null, null, {error:nil}, obj).fail(function(fail) {
        var error = JSON.parse(fail.responseText);
        $("#replication_feedback")
          .html('<h3 class="warning">Replication Failed</h3>' +
                '<pre>' + JSON.stringify(error, null, "  ") + '<pre>');
      }).then(function(result) {
        $("#replication_feedback")
          .html('<h3 class="success">Replication Succeeded</h3>' +
                '<pre>' + JSON.stringify(result, null, "  ") + '<pre>');
      });
    }
  });

  router.post('#delete_replication', function(_, e, form) {
    $.couch.db('_replicator').removeDoc({_id: form.id, _rev:form.rev}).then(function() {
      location.href = "#/replication/";
    });
  });


  router.post('#toggle_replication', function(_, e, form) {
    $.couch.db('_replicator').openDoc(form.id).then(function(data) {
      if (data._replication_state !== 'triggered') {
        delete data._replication_state;
        $.couch.db('_replicator').saveDoc(data).then(function(data) {
          router.refresh();
        });
      }
    });
  });


  router.post('#config', function (_, e, form) {
    $('#saveconfig').val('Saving ...');

    function setConfig(obj) {
      return $.couch.config({}, form.section, obj.key, obj.value);
    }

    $.couch.config().then(function(data) {
      var changes = [];
      $.each(form, function(name) {
        if (name !== "section" && data[form.section][name] != form[name]) {
          changes.push({key: name, value: form[name]});
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

  router.post('#compact_database', function (_, e, form) {
    $.couch.db(form.db).compact({
        fail : function(e){
            console.log(e);
        }
    }).then(function() {
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


  function displayReplicationDoc(id, rtr) {
    $.couch.db('_replicator').openDoc(id).then(function(data) {
      var bleh = [];
      $.each(data, function(key) {
        bleh.push({key: key, value: JSON.stringify(data[key])});
      });
      data.keys = bleh;
      data.error = data._replication_state === 'error';
      data.paused = data._replication_state === 'completed';
      data.triggered = data._replication_state === 'triggered';
      var opts = typeof rtr !== 'undefined' ? rtr : {notransition: true};
      renderer.render('replication_doc_tpl', data, opts);
    });
  }


  function updateReplications() {

    var err = function() {
      clearRefresh();
      $('#running li:not(.header)').remove();
      $("#running").append('<li class="none">You need to be an admin to ' +
                           'read current tasks</li>');
    };

    var opts = {error:err, include_docs: true};
    $.couch.db('_replicator').allDocs(opts).then(function(tasks) {
      var repls = [];
      $.each(tasks.rows, function(i) {
        var replication = tasks.rows[i];
        if (/_design/.test(replication.id)) {
          return;
        }
        repls.push({
          source: replication.doc.source,
          target: replication.doc.target,
          error: replication.doc._replication_state === 'error',
          triggered: replication.doc._replication_state === 'triggered',
          completed: replication.doc._replication_state === 'completed',
          id: replication.id
        });
      });

      var $rows = $(render('#replication_items', {running: repls}));
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
      $(window).unbind('mousedown', hide_login);
      $wrapper.removeClass('open');
      router.refresh();
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
      renderTo("#user_panel", "#logged_in", user);
    } else {
      renderTo("#user", "#logged_out_btn");
    }
  }


  var $wrapper = $("#header");
  var $panel = $("#user_panel");
  var hide_login = function(e) {
    if (!$.contains($panel[0], e.target) &&
        !$.contains($("#user")[0], e.target) &&
        e.target.getAttribute('id') !== 'user_panel') {
      $wrapper.removeClass('open');
      $(window).unbind('mousedown', hide_login);
    }
  };


  (function() {

    $("#user").bind('click', function() {
      if (!$$("#user").user.name) {
        return;
      }
      if ($("#user_panel").is(":visible")) {
        $(window).unbind('mousedown', hide_login);
        $wrapper.removeClass('open');
      } else {
        setTimeout(function() {
          $(window).bind('mousedown', hide_login);
        }, 0);
        $wrapper.addClass('open');
      }
    });

  })();

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
    makeLinksFast(document);
    $.couch.info().then(function(data) {
      version = data;
      router.init(window);
    });
  });

})();
