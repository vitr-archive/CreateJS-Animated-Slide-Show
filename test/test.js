/**
 * Created by Vitaliy.Ryepnoy on 27/11/13.
 */

moviestars.runTests = function () {

  module("Clip Resources");
  test('clipResourcesAvailability', function () {
    var ajaxError = function() {
      console.log(this.url);
      ok(false, "Movie Data Load Error!!! " + this.url);
    }
    var ajaxSuccess = function() {
      ok(true, "Item is available: " + this.url);
    }
    $.ajax({
      url: xmlUrl,
      async: false,
      dataType: 'json',
      success:function(data){
        ok(data, "XML/JSON movie data available");

        ok(data.logouri, "Logo image url is present " + data.logouri);
        $.ajax({url: data.logouri, async: false, success: ajaxSuccess, error: ajaxError});

        ok(data.audiouri, "Voice over audio url is present " + data.audiouri);
        $.ajax({url: data.audiouri, async: false, success: ajaxSuccess, error: ajaxError});

        ok(data.audiouri, "Background audio url is present " + data.backgroundaudiouri);
        $.ajax({url: data.backgroundaudiouri, async: false, success: ajaxSuccess, error: ajaxError});

        equal(typeof data.photolist.photo.uri, 'undefined', 'More than one photo urls are present')

        var totalDuration = 0;
        var checkedUrls = [];
        for (i in data.photolist.photo) {
          if (checkedUrls.indexOf(data.photolist.photo[i].uri) == -1) {
            ok(data.photolist.photo[i].uri, "Photo#" + i + " url is present " + data.photolist.photo[i].uri);
            $.ajax({url: data.photolist.photo[i].uri, async: false, success: ajaxSuccess, error: ajaxError});
            checkedUrls.push(data.photolist.photo[i].uri);

          }
          totalDuration += data.photolist.photo[i].duration_ms*1;
        }

        var checkedUrls = [];
        for (i in data.visualobjectlist.visualobject) {
          var visualobject = data.visualobjectlist.visualobject[i];
          if ('url' in visualobject) {
            if (checkedUrls.indexOf(visualobject.url) == -1) {
              ok(visualobject.url, "Visual Object#" + i + " url is present " + visualobject.url);
              $.ajax({url: visualobject.url, async: false, success: ajaxSuccess, error: ajaxError});
              checkedUrls.push(visualobject.url);
            }
          }
        }
//        equal(totalDuration, data.audio_duration_ms, 'All photos total duration equals audio duration');
        ok(totalDuration >= data.audio_duration_ms, 'All photos total duration equals (or greater) audio voice over duration: '
          + totalDuration + '>=' + data.audio_duration_ms);
      },
      error:ajaxError,
      complete: function() {
//        console.log(t.status);
      }
    });
  });

  module("Utils");
  test('msToMinuteString', function () {
    equal(moviestars.util.msToMinuteString(1000), '0:01', '1000 ms = 0:01');
    equal(moviestars.util.msToMinuteString(10000), '0:10', '10000 ms = 0:10');
    equal(moviestars.util.msToMinuteString(33333), '0:33', '33333 ms = 0:33');
  });

  module("Canvas");
  test('fillCanvasWithImage', function () {
    var tW = 512;
    var tH = 384;

    var t = ' target screen size ' + tW + 'x' + tH;

    var mustBe = {'width': 512, 'height': 384};
    var res = moviestars.util.fillCanvasWithImage(640, 480, tW, tH);
    var r = res.width/res.height + '=' + mustBe.width/mustBe.height;
    deepEqual(res, mustBe, 'image 640x480 -> 512x384' + t);
    equal(res.width/res.height, mustBe.width/mustBe.height, 'Ration must be the same ' + r);

    var mustBe = {'width': 672, 'height': 384};
    var res = moviestars.util.fillCanvasWithImage(840, 480, tW, tH);
    var r = res.width/res.height + '=' + mustBe.width/mustBe.height;
    deepEqual(res, mustBe, 'image 840x480 -> 672x384' + t);
    equal(res.width/res.height, mustBe.width/mustBe.height, 'Ration must be the same ' + r);

    var mustBe = {'width': 512, 'height': 1024};
    var res = moviestars.util.fillCanvasWithImage(240, 480, tW, tH);
    var r = res.width/res.height + '=' + mustBe.width/mustBe.height;
    deepEqual(res, mustBe, 'image 240x480 -> 512x1024' + t);
    equal(res.width/res.height, mustBe.width/mustBe.height, 'Ration must be the same ' + r);
  });

  module("Stats");
  test('statServerConnection', function () {
    $.ajax({
      url: trackUrl + 'get/moviestars/clicktracking/?exportDestinationID=0'
        + '&listingExtRefID=0'
        + '&itemID=1'
        + '&statisticType=2&statisticValue=0'
        + '&userHash=0',
      async: false,
      dataType: 'json',
      success:function(data){
        ok(data, "Stat Server available");
      }
    });
  });

};