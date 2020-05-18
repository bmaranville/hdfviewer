"use strict";

import * as d3 from 'd3';
import * as hdf5 from '@usnistgov/jsfive';
import { default as jquery } from 'jquery';
let $ = jquery;
let jQuery = jquery;
import { default as Split } from 'split.js';
import { default as _jstree } from 'jstree';
import { xyChart, heatChart, get_colormap } from 'd3-science';

var NEXUS_HDF_REGEXP = /\.nxs\.[^\.\/]+$/
var H5_REGEXP = /\.(H|h|hdf|HDF)5$/
var datasets = [];
var selected_node = "";
var chart = null;
var d3_tsvFormat = (d3.tsvFormat) ? d3.tsvFormat : d3.tsv.format;
var d3_tsvFormatRows = (d3.tsvFormatRows) ? d3.tsvFormatRows : d3.tsv.formatRows;
var MAX_DISPLAY_LENGTH = 100000; // arrays bigger than this are displayed with ellipsis...

var makeXY = function (dataset, xcol, ycol, ynormcol) {
  var data_array = [], x, y, ynorm;
  for (var i = 0; i < dataset.points; i++) {
    x = parseFloat(dataset.column[xcol][i]);
    y = parseFloat(dataset.column[ycol][i]);
    if (ynormcol == "1" || ynormcol == null) {
      ynorm = y;
    }
    else {
      ynorm = y / parseFloat(dataset.column[ynormcol][i]);
    }
    data_array[i] = [x, ynorm];
  }
  return data_array;
}

var tree_from_hdf = function (group, tree) {
  var tree = tree || [];
  var name = group.name;
  if (name == '/') {
    name = "#";
  }
  for (var k of group.keys) {
    var datum = {};
    var item = group.get(k);
    datum.id = item.name;
    datum.parent = name;
    datum.text = item.name.replace(/\/$/, '').split('/').slice(-1)[0];
    let is_group = (item instanceof hdf5.Group);
    datum.icon = is_group;
    datum.data = { is_group: is_group };
    tree.push(datum);
    if (is_group) {
      tree_from_hdf(item, tree);
    }
  }
  return tree;
}

var getNexusHDF = function (path, filename) {
  fetch(data_repo + path + filename) //, {mode: 'no-cors'})
    .then(function (response) {
      return response.arrayBuffer()
    })
    .then(function (buffer) {
      var f = new hdf5.File(buffer, filename);
      window.f = f;
      HDFHandler(filename, f);
    });
};


function loadData() {
  var file_input = document.getElementById('datafile');
  var file = file_input.files[0]; // only one file allowed
  let datafilename = file.name;
  let reader = new FileReader();
  reader.onloadend = function (evt) {
    let barr = evt.target.result;
    var f = new hdf5.File(barr, datafilename);
    window.f = f;
    HDFHandler(datafilename, f);
    $("span#loaded_file").text(datafilename);
  }
  reader.readAsArrayBuffer(file);

  file_input.value = "";
}



function HDFHandler(filename, file) {
  //var tree = tree_from_hdf(file);
  var autoscroll = false;
  if ($("#treediv").jstree()) { $("#treediv").jstree().destroy() }
  $("#treediv").jstree({
    core: {
      data: function (node, cb) {
        var parent_id = node.id;
        var parent_hdf_id = (parent_id == '#') ? '/' : parent_id;
        var parent_item = file.get(parent_hdf_id);
        var leaves = parent_item.keys.map(function (k) {
          var leaf = {};
          leaf.id = (parent_hdf_id + '/' + k).replace(/^\/\//, '/');
          leaf.parent = parent_id;
          leaf.text = k;
          let leaf_item = parent_item.get(k);
          if (leaf_item instanceof hdf5.Group) {
            leaf.children = true;
            leaf.data = { is_group: true }
          }
          else {
            leaf.icon = false;
            leaf.data = { is_group: false }
          }

          if (selected_node && selected_node.startsWith(leaf.id)) {
            leaf.state = { opened: true };
          }

          return leaf;
        });

        leaves.sort(function (a, b) {
          var a_isdir = (a.data.is_group),
            b_isdir = (b.data.is_group);
          if (a_isdir && !b_isdir) { return -1 }
          else if (b_isdir && !a_isdir) { return 1 }
          else { return ((a.text > b.text) ? 1 : -1) }
        });

        cb(leaves);
      }
    }
  });
  window.jstree = $("#treediv").jstree(true);
  $("#active_file").text(filename);
  $("#treediv").bind("select_node.jstree", function (e, data) {
    var id = $(data.node).attr("id");
    var node = data.node;
    selected_node = id;
    var isdir = node.data.is_group;
    let item = file.get(id);
    let attrs = item.attrs;
    $("#link_target").html("<pre>link to: " + attrs.target + "</pre>");
    if (item.shape) {
      attrs.shape = item.shape;
    }
    if (item.dtype) {
      attrs.dtype = item.dtype;
    }
    let display_attrs = {};
    for (var attr_key in attrs) {
      let attr_item = attrs[attr_key];
      if (attr_item.length && attr_item.length > MAX_DISPLAY_LENGTH) {
        display_attrs[attr_key] = "Too long to display...";
      }
      else {
        display_attrs[attr_key] = attr_item;
      }
    }
    $("#device_attrs")
      .html("<pre>" + JSON.stringify(display_attrs, null, 2).replace(">", "&gt;").replace("<", "&lt;") + "</pre>");
    $("#device_values").height('auto');
    if (!isdir) {
      let shape = item.shape;
      let is_1d = (
        (shape && shape.length) &&
        (
          (shape.length == 1 && (!/S/.test(item.dtype)) && shape[0] > 1) ||
          (shape.length == 2 && Math.max.apply(Math, shape) > 1 && Math.min.apply(Math, shape) == 1)
        )
      );
      if (is_1d) {
        // then it's a simple 1d array
        let v = item.value;
        //item.getValue().then(function(v) {
        let data_1d = v.map(function (d, i) { return [i, d] });
        let options = { axes: { xaxis: { label: "point" }, yaxis: { label: item.attrs.long_name || '' } } };
        var chart = new xyChart(options, d3);
        window.mychart = chart;
        $("#device_values").empty().height(300);
        d3.select("#device_values").data([[data_1d]]);
        d3.select("#device_values").call(chart);
        chart.zoomRect(true);
        //});
      }
      else if ((!/S/.test(item.dtype)) && shape && shape.length && shape.length > 1) {
        let v = item.value;
        $("#device_values").empty().height(300);
        var xdim = shape.slice(-2)[0];
        var ydim = shape.slice(-1)[0];
        var dims = {
          xmin: 0,
          xmax: xdim,
          xdim: xdim,
          ymin: 0,
          ymax: ydim,
          ydim: ydim
        };

        var size = xdim * ydim;
        var flattened = v.slice(0, size);

        if (chart && chart.destroy) { chart.destroy() }
        var plot_2d_options = {
          "ztransform": 'log',
          "aspect_ratio": 1.0,
          "autoscale": true,
          //"source_order": "F",
          axes: {
            xaxis: { label: 'x' },
            yaxis: { label: 'y' }
          }
        }
        chart = new heatChart(plot_2d_options, d3);
        chart
          .colormap(get_colormap("jet", d3))
          .autoscale(true)
          .dims(dims);
        d3.select('#device_values')
          .data([flattened])
          .call(chart);
        chart.zoomScroll(true);
        //$("#device_values").html('<pre class="value"> binary array </pre>');
      }
      else {
        $("#device_values").empty().height(0);
      }
      let v = item.value;
      if (v != null) {
        if (shape.length < 2 && shape[0] == 1) {
          v = v[0];
        }
        var s;
        if (typeof (v) == 'string') {
          s = v;
        }
        else if (typeof (v) == 'number') {
          s = String(v);
        }
        else if (v instanceof Array) {
          // get total size...
          if (v.length > MAX_DISPLAY_LENGTH) {
            s = "Array length is greater than MAX (" + MAX_DISPLAY_LENGTH.toFixed() + "): not displayed;"
          }
          else if (shape.length == 1) {
            s = d3_tsvFormatRows([v]);
          }
          else if (shape.length == 2) {
            s = d3_tsvFormatRows(reshape2d(v, shape));
          }
          else {
            s = JSON.stringify(v, null, 2);
          }
        }
        else {
          s = "unknown type";
        }
        $("#device_values_alpha_num").html('<pre class="value">' + s + '</pre>');
      } else {
        $("#device_values_alpha_num").html('<pre class="value"></pre>');
      }

    }
    else {
      $("#device_values").html("<pre>Group</pre>");
      $("#device_values_alpha_num").html('<pre class="value"></pre>');
      data.instance.toggle_node(data.node);
    }
  });
  $("#treediv").bind("activate_node.jstree", function (a, b) {
    if (autoscroll) {
      // jquery doesn't like front-slash in id, so don't use for this:
      if (document.getElementById(selected_node)) {
        document.getElementById(selected_node).scrollIntoView();
      }
      autoscroll = false;
    }
  });

  $("#treediv").bind("ready.jstree", function () {
    if (selected_node) {
      autoscroll = true;
    }
  });

  $("#treediv").bind("after_open.jstree", function (event, data) {
    if (selected_node && data.node.children.includes(selected_node)) {
      let selected_node_obj = $(this).jstree(true).get_node(selected_node);
      if (selected_node_obj) {
        $(this).jstree(true).activate_node(selected_node_obj);
      }
    }
  });

}

function compactDateTime(date) {
  var outstring = '';
  outstring += date.getHours().toFixed(0) + ":";
  outstring += ("00" + date.getMinutes().toFixed(0)).slice(-2) + ":";
  outstring += ("00" + date.getSeconds().toFixed(0)).slice(-2) + "&nbsp;";
  outstring += date.getMonth().toFixed(0) + "/";
  outstring += date.getDay().toFixed(0) + "/";
  outstring += date.getFullYear().toFixed(0);
  return outstring
}

function reshape2d(v, shape) {
  var output = [];
  var total_size = shape[0] * shape[1];
  for (var ai = 0; ai < total_size; ai += shape[1]) {
    output.push(v.slice(ai, ai + shape[1]));
  }
  return output;
}

window.onload = function () {

  //$('#xcol, #ycol, #xscale, #yscale, #ynormalize').change(handleChecked);

  Split(['#centerpane', '#right'], {
    sizes: [75, 25],
    gutterSize: 8,
    cursor: 'col-resize'
  })

  var fileinput = document.getElementById('datafile');
  fileinput.onchange = loadData;
}