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
      return JSON.parse(localStorage.getItem(prop) || 'false') || def;
    },
    remove:function(prop){
      localStorage.removeItem(prop);
    }
  };
})();

var MobileFuton = (function () {

  var mainDb = location.pathname.split("/")[1]
    , interval = null
    , router = Router()
    , renderer = Renderer()
    , docs = {}
    , replications = localData.get('replications', [])
    , clearRefresh = function() { clearInterval(interval); };


  router.get(/^(#)?$/, function () {
    setTitle('CouchDB');
    getN([$.couch.session(), $.couch.info()]).then(function(data, inf) {
      var tpldata =
          { ip: router.params.ip || location.hostname
          , port: location.port || 80
          , version: (inf[0].version)
          , adminparty: (data[0].userCtx.roles.indexOf('_admin') != -1) }
      renderer.render('home_tpl', tpldata);
    });
  });


  router.get('#/couchapps/', function () {

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
          renderer.render('couchapps_tpl', {couchapps:couchapps});
        }
      }

      $.ajax({type:'HEAD', url:url, complete: complete});
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


  router.get('#/databases/:database/', function (database) {
    router.forward('#/databases/' + database + '/views/_all_docs');
  });


  router.get('#/databases/:database/views/*view', function (database, view) {

    var dbname = decodeURIComponent(database)
      , viewname = view.replace('-', '/')
      , views = []
      , id = null;

    setTitle(dbname + '/' + viewname);

    $.couch.db(dbname).allDesignDocs({include_docs:true}).then(function(ddocs) {
      $.each(ddocs.rows, function(ddoc) {
        id = ddocs.rows[ddoc].doc._id;
        $.each(ddocs.rows[ddoc].doc.views || [], function(v) {
          views.push({id:id, ddoc:id.replace('_design/', ''), name:v});
        });
      });

      var callback = function(data) {
        data = $.extend(data, { database: dbname, start: 1
                              , end: data.total_rows, views: views});

        renderer.render('database_tpl', data, {}, function(tpl) {
          $('#views_select', tpl).val(view).bind('change', function() {
            location.href = '#/databases/' + database + '/views/' + $(this).val();
          });
        });
      };

      if (view === '_all_docs') {
        $.couch.db(database).allDocs({}).then(callback);
      } else if (view === '_design_docs') {
        $.couch.db(database).allDesignDocs({}).then(callback);
      } else {
        $.couch.db(database).view(viewname, {}).then(callback);
      }

    });
  });


  router.get('#/databases/:database/*doc', function (database, doc) {
    database = decodeURIComponent(database);
    $.couch.db(database).openDoc(doc).then(function(json) {
      setTitle(database + '/' + doc);
      renderer.render('document_tpl', {json:JSON.stringify(json, null, ' ')});
    });
  });


  router.get('#/databases/', function () {
    $.couch.allDbs().then(function(data) {
      setTitle('Databases');
      data = $.map(data, function(url) {
        return {url:encodeURIComponent(url), name:url};
      });
      renderer.render('databases_tpl', {databases:data});
    });
  });


  router.get('#/replication/', function () {
    setTitle('Replication');
    $.couch.allDbs({}).then(function(data) {
      renderer.render('replication_tpl', {
        databases: data,
        replications: replications
      }, {}, function(tpl) { setupReplicationEvents(tpl); updateReplications(); });
    });
    interval = setInterval(updateReplications, 5000);
  }).unload(clearRefresh);


  router.get('#/config/', function () {

    setTitle('Config');

    var html = ''
      , header = '<ul><li class="header">{{id}}</li>'
      , item = '<li><label>{{name}}<br /><div class="inputwrap">' +
      '<input type="text" name="{{id}}:{{name}}" value="{{value}}" />' +
      '</div></label></li>'

    $.couch.config({error:unauth}).then(function(data) {
      $.each(data, function(id) {
        html += Mustache.to_html(header, {id:id});
        $.each(data[id], function(opts) {
          html += Mustache.to_html(item, {name:opts, id:id, value:data[id][opts]});
        });
        html += '</ul>';
      });
      renderer.render('config_tpl', {config:html});
    });
  });


  router.get('#/tasks/', function () {

    setTitle('Active Tasks');

    $.couch.activeTasks({error: unauth}).then(function(data) {
      renderer.render('tasks_tpl', {tasks: data});
    });
    interval = setInterval(updateActiveTasks, 5000);
  }).unload(clearRefresh);


  router.post('/replication/', function (e, form) {

    if (!replicationExists(form)) {
      replications.push(form);
      localData.set('replications', replications);
    }

    var obj = { source: form.custom_source || form.source
              , target: form.custom_target || form.target
              , create_target: true
              , continuous: (form.continuous === 'on') };

    $.couch.replicate(form.source, form.target, {error:nil}, obj)
           .then(updateReplications);
  });


  router.post('#/config/', function (e, form) {

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

      getN($.map(changes, setConfig)).then(function() {
        $('#saveconfig').val('Save Config');
      });
    });
  });

  var getN = function(arr) {
    return $.when.apply(this, arr);
  };


  var setTitle = function(text) {
    $('#title, title').text(text);
  };


  var unauth = function() {
    clearRefresh();
    renderer.render('unauthorized_tpl');
  };


  var updateActiveTasks = function(transition) {

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
      if ($obj.attr('data-continous') === 'on') {
        $('#continous', tpl).attr('checked', 'checked');
      } else {
        $('#continous', tpl).removeAttr('checked');
      }
    });

    $('.delete', tpl).bind('mousedown', function() {
      var parent = ($(this).parents('li'))
        , source = parent.data('source')
        , target = parent.data('target')
        , repl = $.grep(replications, function(obj) {
          return !(obj.source === source && obj.target === target);
        });
      localData.set('replications', repl);
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

    if (parts[0].match('continuous')) {
      obj.continuous = true;
    }

    if (parts[0].match('create_target')) {
      obj.create_target = true;
    }

    return obj;
  };


  var updateReplications = function() {

    $.couch.activeTasks({}).then(function(tasks) {

      for(var replTasks = [], i = 0; i < tasks.length; i++) {
        if (tasks[i].type === 'Replication') {
          replTasks.push(parseReplicationTask(tasks[i].task));
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


  var render = function(tpl, data) {
    return Mustache.to_html($(tpl).html(), data);
  }

  router.init();

})();
