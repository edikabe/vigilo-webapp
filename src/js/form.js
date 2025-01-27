import $ from 'jquery';
import L from 'leaflet';
import 'leaflet-control-geocoder';
import 'leaflet.fullscreen';
import 'leaflet.locatecontrol';
import piexif from 'piexifjs';

import * as vigilo from './vigilo-api';
import * as vigiloconfig from './vigilo-config';
import relatedIssueCard from '../html/related-issue-card';
import errorCard from '../html/error';
import ImageDrawable from './image-drawable';
import LocalDataManager from './localDataManager';
import dataManager from './dataManager';

import * as semver from 'semver';

window.startForm = async function (token) {
  clearForm()
  var modal = M.Modal.getInstance($("#modal-form")[0]);
  modal.open();
  await initFormMap();

  $("#issue-cat option[value=resolution]").removeProp("disabled");
  $(".onissueonly").show();
  $(".onresolutiononly").hide();

  if (token !== undefined) {
    $("#issue-cat option[value=resolution]").prop("disabled", "true");
    var issues = await dataManager.getData();
    var issue = issues.filter(item => item.token == token)[0];

    $("#issue-token").val(token);

    $("input[type='file']").prop("required", false)
    renderImage(issue.img)

    setFormMapPoint([issue.lat_float, issue.lon_float], issue.address);
    setDate(issue.date_obj)
    setTime(issue.date_obj.getHours(), issue.date_obj.getMinutes());

    $("#issue-cat option[value='" + issue.categorie + "']").prop('selected', true);
    $("#issue-cat").parent().find("input[type='text']").val(issue.categorie_str);

    $("#issue-comment").val(issue.comment);
    $("#issue-explanation").val(issue.explanation);
    M.updateTextFields()
  }
}

function clearForm() {
  $('#modal-form form').trigger("reset");
  if (mapmarker !== undefined) {
    mapmarker.remove()
  }
  $("#modal-form-loader .determinate").css("width", "10%");
  $("#related-issues").removeClass("invalid");
}

/**
 * On file change, load image, read date, time and position and generate a rotated image
 */
$("#modal-form input[type=file]").change(function () {
  var input = this;
  if (input.files && input.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) {

      // Render image preview
      renderImage(e.target.result);

      // Read Exif
      var located = false
      var timestamp = false;
      var exifObj = piexif.load(e.target.result);
      if (exifObj.GPS != undefined && exifObj.GPS[piexif.GPSIFD.GPSLatitude] !== undefined) {
        // GPS available : position, date & time
        // Position
        var lat = piexif.GPSHelper.dmsRationalToDeg(exifObj.GPS[piexif.GPSIFD.GPSLatitude], exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef])
        var lon = piexif.GPSHelper.dmsRationalToDeg(exifObj.GPS[piexif.GPSIFD.GPSLongitude], exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef])
        setFormMapPoint([lat, lon])
        // Date
        var date = new Date(exifObj.GPS[piexif.GPSIFD.GPSDateStamp].split(':').join('-'));
        // Time
        var hours = exifObj.GPS[piexif.GPSIFD.GPSTimeStamp][0][0] / exifObj.GPS[piexif.GPSIFD.GPSTimeStamp][0][1];
        var minutes = exifObj.GPS[piexif.GPSIFD.GPSTimeStamp][1][0] / exifObj.GPS[piexif.GPSIFD.GPSTimeStamp][1][1];
        date.setUTCHours(hours)
        date.setUTCMinutes(minutes)
        setDate(date)
        setTime(date.getHours(), date.getMinutes())
        located = true;
        timestamp = true;
      } else if (exifObj['Exif'] !== undefined && exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] !== undefined) {
        // No GPS : date & time ?
        var datetime = exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal]
        var date = new Date(datetime.split(" ")[0].split(":").join("-"))
        date.setHours(datetime.split(" ")[1].split(":")[0])
        date.setMinutes(datetime.split(" ")[1].split(":")[1])
        setDate(date)
        setTime(date.getHours(), date.getMinutes())
        timestamp = true;
      }

      if (!located) {
        // geolocate and add point
        formmap.locate();
      }

      if (!timestamp) {
        // Use current time
        var now = new Date();
        setDate(now)
        setTime(now.getHours(), now.getMinutes())
      }


    }
    reader.readAsDataURL(input.files[0]);
  }
})

function renderImage(src) {
  var image = new Image();
  image.crossOrigin = "Anonymous";
  image.onload = function () {
    var orientation = 0;

    if (typeof src != "string") {
      try {
        var exifObj = piexif.load(src);
        if (exifObj["0th"] !== undefined && exifObj["0th"][piexif.ImageIFD.Orientation] !== undefined) {
          orientation = exifObj["0th"][piexif.ImageIFD.Orientation];
        }
      } catch {}
    }

    var canvas = document.createElement("canvas");

    var sx = vigiloconfig.IMAGE_MAX_SIZE / image.width;
    var sy = vigiloconfig.IMAGE_MAX_SIZE / image.height;
    var scale = Math.min(sx, sy);


    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    var ctx = canvas.getContext("2d");
    var x = 0;
    var y = 0;
    ctx.save();
    if (orientation == 2) {
      x = -canvas.width;
      ctx.scale(-scale, scale);
    } else if (orientation == 3) {
      x = -canvas.width;
      y = -canvas.height;
      ctx.scale(-scale, -scale);
    } else if (orientation == 4) {
      y = -canvas.height;
      ctx.scale(scale, -scale);
    } else if (orientation == 5) {
      canvas.width = image.height * scale;
      canvas.height = image.width * scale;
      ctx.translate(canvas.width, canvas.height / canvas.width);
      ctx.rotate(Math.PI / 2);
      y = -canvas.width;
      ctx.scale(scale, -scale);
    } else if (orientation == 6) {
      canvas.width = image.height * scale;
      canvas.height = image.width * scale;
      ctx.translate(canvas.width, canvas.height / canvas.width);
      ctx.rotate(Math.PI / 2);
    } else if (orientation == 7) {
      canvas.width = image.height * scale;
      canvas.height = image.width * scale;
      ctx.translate(canvas.width, canvas.height / canvas.width);
      ctx.rotate(Math.PI / 2);
      x = -canvas.height;
      ctx.scale(-scale, scale);
    } else if (orientation == 8) {
      canvas.width = image.height * scale;
      canvas.height = image.width * scale;
      ctx.translate(canvas.width, canvas.height / canvas.width);
      ctx.rotate(Math.PI / 2);
      x = -canvas.height;
      y = -canvas.width;
      ctx.scale(-scale, -scale);
    }
    ctx.drawImage(image, 0, 0, image.width, image.height, x, y, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);


    $("#picture-preview").empty().append(canvas);
    $("#picture-preview").next().removeClass('hide');
    ImageDrawable($("#picture-preview"))


  }
  image.src = src;
}

var formmap, mapmarker;
async function initFormMap() {
  if (formmap !== undefined) {
    formmap.invalidateSize()
    return;
  }

  var scope = await vigilo.getScope();

  formmap = L.map('form-map', {
    fullscreenControl: true,
    fullscreenControlOptions: {
      position: 'topleft'
    }
  }).setView([43.605413, 3.879568], 11);

  formmap.fitBounds([
    [
      parseFloat(scope.coordinate_lat_min),
      parseFloat(scope.coordinate_lon_min)
    ], [
      parseFloat(scope.coordinate_lat_max),
      parseFloat(scope.coordinate_lon_max)
    ]
  ]);

  var baseLayers = {
    "Carte": L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}' + (L.Browser.retina ? '@2x.png' : '.png'), {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>',
      subdomains: 'abcd',
      minZoom: 0,
      maxZoom: 20,
      ext: 'png'
    }).addTo(formmap),
    "Photos": L.tileLayer(
      "https://wxs.ign.fr/choisirgeoportail/geoportail/wmts?" +
      "&REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0" +
      "&STYLE=normal" +
      "&TILEMATRIXSET=PM" +
      "&FORMAT=image/jpeg" +
      "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS" +
      "&TILEMATRIX={z}" +
      "&TILEROW={y}" +
      "&TILECOL={x}",
      {
        minZoom: 0,
        maxZoom: 20,
        maxNativeZoom: 18,
        attribution: '<a href="http://www.ign.fr">IGN-F/Geoportail</a>',
        tileSize: 256
      }
    ),
  };

  L.control.layers(baseLayers, {}).addTo(formmap);

  mapmarker = L.marker([0, 0], {
    draggable: true,
    autoPan: true
  }).on('dragend', (e) => {
    setFormMapPoint(mapmarker.getLatLng())
  })

  formmap.on('click locationfound', (e) => { setFormMapPoint(e.latlng) })

  formmap.geocoderCtrl = L.Control.geocoder({
    position: 'topright',
    defaultMarkGeocode: false
  }).on('markgeocode', function (e) {
    setFormMapPoint(e.geocode.center, e.geocode)
  }).addTo(formmap)

  L.control.locate({
    locateOptions: {
      enableHighAccuracy: true
    },
    iconElementTag: 'i',
    icon: 'material-icons tiny location_searching',
    iconLoading: 'material-icons tiny',
    drawCircle: false

  }).addTo(formmap)

  // We use materialcss iconw instead of fontawesome
  $("i.location_searching").append('location_searching')

  $("#issue-address").change(() => {
    if (mapmarker.getLatLng().lat == 0 && mapmarker.getLatLng().lng == 0) {
      formmap.geocoderCtrl._input.value = $("#issue-address").val()
      formmap.geocoderCtrl._geocode()
    }
  });
}



async function setFormMapPoint(latlng, address) {
  await findNearestIssue(latlng);

  if (formmap === undefined) {
    return
  }
  var scope = await vigilo.getScope();
  var bounds_scope = L.latLngBounds([scope.coordinate_lat_min, scope.coordinate_lon_min], [scope.coordinate_lat_max, scope.coordinate_lon_max])

  if (!bounds_scope.contains(latlng)) {
    // Outside !
    alert("La localisation doit se trouver dans la zone géographique choisie.");
    return
  }

  formmap.setView(latlng, 18);
  mapmarker.setLatLng(latlng).addTo(formmap)
  if (address !== undefined) {
    $("#issue-address").val(addressFormat(address))
    M.updateTextFields();
  } else {
    //Reversegeocoding
    formmap.geocoderCtrl.options.geocoder.reverse(mapmarker.getLatLng(), 1, function (result) {
      if (result.length > 0) {
        $("#issue-address").val(addressFormat(result[0]))
        M.updateTextFields();
      }
    })
  }
}

function deg2rad(val){return val * Math.PI / 180}

// https://numa-bord.com/miniblog/php-calcul-de-distance-entre-2-coordonnees-gps-latitude-longitude/
function distance(lat1, lng1, lat2, lng2)
{
    var earth_radius = 6378137; // Terre = sphère de 6378km de rayon
    var rlo1         = deg2rad(lng1);
    var rla1         = deg2rad(lat1);
    var rlo2         = deg2rad(lng2);
    var rla2         = deg2rad(lat2);
    var dlo          = (rlo2 - rlo1) / 2;
    var dla          = (rla2 - rla1) / 2;
    var a            = (Math.sin(dla) * Math.sin(dla)) + Math.cos(rla1) * Math.cos(rla2) * (Math.sin(dlo) * Math.sin(dlo));
    var d            = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return earth_radius * d;
}

function isResolvable(i){
  return i.approved == 1 && i.status !=1 && i.resolvable;
}

async function findNearestIssue(latlng){
  var issue = await vigilo.getIssues();
  var related_issues = issue.filter(isResolvable).filter((i) => distance(latlng.lat, latlng.lng, i.lat_float, i.lon_float) < 500);
  related_issues.sort((a,b)=>distance(latlng.lat, latlng.lng, a.lat_float, a.lon_float) > distance(latlng.lat, latlng.lng, b.lat_float, b.lon_float))
  console.log(related_issues);
  $("#related-issues").empty();
  related_issues.forEach((i)=>$("#related-issues").append(relatedIssueCard(i)))
  M.Materialbox.init($("#related-issues .materialboxed"));
  $(".related-issue a.btn-floating").click(function(){
    var icon = $(this).find("i");
    var div = $(this).parent();
    var isChecked = div.hasClass("checked");
    if (isChecked){
      div.removeClass("checked");
      icon.empty().append("add")
    } else {
      div.addClass("checked");
      icon.empty().append("remove")
    }
  })
}

function addressFormat(address) {
  if (typeof address == "object") {
    return `${address.properties.address.road || address.properties.address.pedestrian || address.properties.address.footway || ''}, ${address.properties.address.village || address.properties.address.town || address.properties.address.city}`
  }
  return address
}

function getDate() {
  if ($("#issue-date").prop("type") == "date") {
    // Browser default (mobile devices)
    return new Date($("#issue-date").val());
  } else {
    // Materializecss picker
    return M.Datepicker.getInstance($("#issue-date")).date;
  }
}
function getTime() {
  if ($("#issue-time").prop("type") == "time") {
    // Browser default (mobile devices)
    return $("#issue-time").val().split(":");
  } else {
    // Materializecss picker
    return [M.Timepicker.getInstance($("#issue-time")).hours,
    M.Timepicker.getInstance($("#issue-time")).minutes]
  }

}
function setDate(date) {
  if ($("#issue-date").prop("type") == "date") {
    // Browser default (mobile devices)
    $("#issue-date").val(date.getFullYear() + "-" + String("0" + (date.getMonth() + 1)).slice(-2) + "-" + String("0" + (date.getDate())).slice(-2));
  } else {
    // Materializecss picker
    M.Datepicker.getInstance($("#issue-date")).setDate(date, true);
    M.Datepicker.getInstance($("#issue-date")).setInputValue();
  }

}
function setTime(hours, minutes) {
  if ($("#issue-time").prop("type") == "time") {
    // Browser default (mobile devices)
    $("#issue-time").val(String("0" + hours).slice(-2) + ":" + String("0" + minutes).slice(-2));
  } else {
    // Materializecss picker
    M.Timepicker.getInstance($("#issue-time")).hours = hours;
    M.Timepicker.getInstance($("#issue-time")).minutes = minutes;
    M.Timepicker.getInstance($("#issue-time")).done()
  }
}

$("#modal-form #issue-cat").change(function(){
  if ($("#issue-cat").val() == "resolution"){
    $(".onissueonly").hide();
    $(".onresolutiononly").show();
  } else {
    $(".onissueonly").show();
    $(".onresolutiononly").hide();
  }
})

/**
 * On submit, prepare data and send
 */
$("#modal-form form").submit((e) => {


  var data = {};
  data.token = $("#issue-token").val();
  data.comment = $("#issue-comment").val();
  data.version = vigiloconfig.VERSION;
  data.time = getDate()
  var time = getTime()
  data.time.setHours(time[0])
  data.time.setMinutes(time[1])
  data.time = data.time.getTime()

  var isResolution = $("#issue-cat").val()=="resolution";

  if (isResolution){
    data.tokenlist = $(".related-issue.checked").map(function(){return $(this).data('token')}).toArray().join(',');
    if (data.tokenlist.length == 0){
      // TODO I18N
      M.toast({html: 'Vous devez sélectionner au moins une observation résolue', classes: "red"})
      $("#related-issues").addClass("invalid");
      e.preventDefault();
      return
    }
  } else {
    data.scope = vigiloconfig.getInstance().scope;
    data.coordinates_lat = mapmarker.getLatLng().lat;
    data.coordinates_lon = mapmarker.getLatLng().lng;
    data.explanation = $("#issue-explanation").val();
    data.categorie = parseInt($("#issue-cat").val());
    data.address = $("#issue-address").val();
  }
  $("#related-issues").removeClass("invalid");
  var modalLoader = M.Modal.getInstance($("#modal-form-loader"))
  modalLoader.open()

  var key;
  if (LocalDataManager.isAdmin()) {
    key = LocalDataManager.getAdminKey();
  }

  var firstStep;

  if (isResolution){
    firstStep = vigilo.createResolution(data);
  } else {
    firstStep = vigilo.createIssue(data, key);
  }
  
  firstStep
    .then((createResponse) => {
      if (createResponse.status != 0 && createResponse.token == undefined) {
        throw "error"
      }

      // Store secretId
      if (key === undefined) {
        LocalDataManager.setTokenSecretId(createResponse.token, createResponse.secretid);
      }

      $("#modal-form-loader .determinate").css("width", "50%");
      var jpegb64 = $("#picture-preview canvas")[0].toDataURL("image/jpeg", 1.0).split(",")[1];
      return vigilo.addImage(createResponse.token, createResponse.secretid, jpegb64, isResolution)
    })
    .then(() => {
      $("#modal-form-loader .determinate").css("width", "100%");
      setTimeout(function () {
        window.location.reload()
      }, 1000)
    })
    .catch((e) => {
      $("#modal-form-loader")
        .empty()
        .append(errorCard(e))
    })

  e.preventDefault();
})



export async function init() {
  try {
    // Fill category select
    var cats = await vigiloconfig.getCategories();
    for (var i in cats) {
      if (cats[i].disable == false || LocalDataManager.isAdmin()) {
        $("#issue-cat").append(`<option value="${i}">${cats[i].name}</option>`)
      }
    }

    //Resolution as a category
    var scope = await vigilo.getScope();
    if (semver.gte( scope.backend_version ,"0.0.14")) {
      var otherCat = $("#issue-cat option").last().remove();
      $("#issue-cat").append(`<option value="resolution">Un problème a été corrigé !</option>`);
      $("#issue-cat").append(otherCat);
    }

    M.Modal.init($("#modal-form"));
    M.Modal.init($("#modal-form-loader"))

    if (!WE_ARE_ON_A_MOBILE) {
      M.Datepicker.init($("#issue-date"), {
        container: 'body',
        firstDay: 1,
        format: 'dd mmm yyyy',
        i18n: {
          months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
          monthsShort: ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
          weekdays: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
          weekdaysShort: ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'],
          weekdaysAbbrev: ['D', 'L', 'Ma', 'Me', 'J', 'V', 'S'],
          cancel: "Annuler",

        },
        autoClose: true,
        onSelect: (date) => {
          M.Timepicker.getInstance($("#issue-time")).open()
        }
      });
      M.Timepicker.init($("#issue-time"), {
        container: 'body',
        autoClose: true,
        twelveHour: false,
        i18n: {
          'cancel': 'Annuler',
          'done': 'ok'
        },
        onCloseEnd: () => {
          $("#issue-cat").focus()
        }
      });
      M.FormSelect.init($("#issue-cat"))
    } else {
      // Use browser default inputs on mobile
      $("#issue-cat").addClass('browser-default')
      $("#issue-date").attr('type', 'date');
      $("#issue-time").attr('type', 'time');
    }

  } catch (e) {
    $("#issues .cards-container").empty().append(errorCard(e));
  }
}
