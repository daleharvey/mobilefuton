var Renderer = (function() {

  var paneWidth = 0;
  var currentOffset = 0;
  var current_tpl = null;
  var lastPane = null;
  var block_transition = false;

  $(window).bind("resize", function () {
    paneWidth = $("body").width();
  });
  $(window).resize();


  function blockTransition() {
    block_transition = true;
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

  function render(tpl, data, opts, callback) {

    opts = opts || {};
    data = data || {};

    var rendered = Mustache.to_html($("#" + tpl).html(), data),
    $pane = $("<div class='pane'><div class='content'>" + rendered + "</div></div>");

    makeLinksFast($pane);

    if (callback) {
      callback($pane);
    }

    if (block_transition) {
      opts.notransition = true;
      block_transition = false;
    }

    if (opts.notransition || (opts.router && opts.router.refresh)) {

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
        var goBack = (opts.router && (opts.router.back || opts.router.home));
        currentOffset += !goBack ? paneWidth : -paneWidth;
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
    render: render,
    blockTransition: blockTransition
  };
});
