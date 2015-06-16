function moviestars(autoload, autoplay) {

  moviestars = {}; // global variable, everything prefixed with 'moviestars.' is publicly accessible
  moviestars.jsonData = {};
  moviestars.paused = true;

  var canvas, stage, /*timeline,*/ screenWidth, screenHeight;
  var queueFailed = false;

  var muted = false;
  var loaded = false;
  var soundInstance = [];
  var imgObject = [];
//  var sizeFactor = 1.45;
  var sizeFactor = 1.35; // despite the save value, the flash version looks smaller, so this one has been reduced
  var zoomFactor = 1.2;
  var pauseIndex = 0;
  var rewindDelay = 2000; //ms
  var visualObjectFadeInDuration = 1000; //ms, the value is missing in xml
  var visualObjectFadeOutDuration = 1000; //ms, the value is missing in xml
  var visualObjectWipeInDuration = 1000; //ms, the value is missing in xml
  var visualObjectWipeOutDuration = 1000; //ms, the value is missing in xml
  var photoFadeInterval = 750; //ms
  var timeLineMilestone = [0, 25, 50, 75, 98, 100]; // %percentage
  var statSent = -1; // the value from timeLineMilestone
  var userHash;
  var clipDuration; // equals to this.jsonData.audio_duration_ms (???)
  //  top: -1 , bottom: +1
  var customRatioHeightCrop = -1; // the screen with unmatched aspect ratio will be cut from top (we have texts on the bottom usually)
  var ratioAdjustmentK, ratioAdjustedHeight, ratioAdjustedHeightDiff;
  var wipeEffects = ['wipe-from-left', 'wipe-from-right', 'wipe-from-top', 'wipe-from-bottom'];

  // general purpose functions
  moviestars.util = {
    rgbToHex: function(r, g, b) {
      return "#" + this.componentToHex(r) + this.componentToHex(g) + this.componentToHex(b);
    },
    componentToHex: function(c) {
       var hex = c.toString(16);
       return hex.length == 1 ? "0" + hex : hex;
    },
    msToMinuteString: function(ms) {
      var minutes = Math.floor(ms/1000/60);
      var seconds = Math.floor((ms-minutes*60*1000)/1000).toString();
      if (seconds.length < 2)
        seconds = '0' + seconds;
      return minutes + ':' + seconds;
    },
    // you may have black borders, but can see the full image
    fitImageIntoCanvas: function(width, height, maxWidth, maxHeight) {
      var ratio = Math.min(maxWidth / width, maxHeight / height );
      return { width:width*ratio, height:height*ratio };
    },
    // you may cut the image, but it fills the whole canvas (it always keeps original aspect ratio)
    fillCanvasWithImage: function(width, height, targetWidth, targetHeight) {
      var ratio = Math.max(targetWidth / width, targetHeight / height );
      return { width:width*ratio, height:height*ratio };
    },
    randomString: function(length, chars) {
      var result = '';
      for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
      return result;
    }
  };

  // handling preload queue events
  var preloadHandle = {
    overallProgress: function(e) {
      $('#moviestars_txtLoader').text('Loading...' + Math.round(e.loaded*100) + '%');
    },
    complete: function() {
      if (queueFailed) {
        console.log('Movie Content Load Error!!!');
        throw 'stop execution';
      }
      moviestars.clip.make();
    },
    fileLoad: function(event) {
      // set background image (a car)
      switch (event.item.type){
        case createjs.LoadQueue.IMAGE:
          if ('isvisualobject' in event.item) {
            imgObject[event.item.id] = new createjs.Bitmap(event.result);
    //          imgObject[event.item.id].name = event.item.id;
          } else {
            imgObject[event.item.id] = new createjs.Bitmap(event.result);
          }
          break;
        case createjs.LoadQueue.SOUND:
          soundInstance[event.item.id] = createjs.Sound.play(event.item.src);
          if (event.item.volume)
            soundInstance[event.item.id].setVolume(event.item.volume);
          soundInstance[event.item.id].pause();
          break;
        // if amazon returns 403 we've got unexpected content
        default :
          queueFailed = true;
          throw "Movie Content Load Error!!!";
      }
    },
    // amazon returns 403 and this is never fired  (XHRLoader.js line #343)
    fileError: function (event) {
      queueFailed = true;
      console.log('Movie Content Load Error!!! ' + event.text + ' URL:'  + event.item.src);
      moviestars.clip.reload();
    }
  };

  // player functions
  moviestars.player = {
    init: function() {
      $("#moviestars_track").on("click", function(e) {
        if (!loaded)
          return;
        if (!moviestars.paused)
          timeline.setPaused(true);
        var pos = e.clientX - controlButtonWidth;
        var newPos = Math.round(timeline.duration/(canvasWidth-controlButtonWidth*2)*pos) - controlButtonWidth ;
        timeline.setPosition(newPos);

        for (i in soundInstance) {
          soundInstance[i].pause(); // chrome pause/resume issue fix
          soundInstance[i].play({offset:newPos});
          if (moviestars.paused)
            soundInstance[i].pause();
        }
        if (!moviestars.paused)
          timeline.setPaused(false);
        else
          moviestars.player.showPaused();
      });

      $("#moviestars_play,#moviestars_canvasContainer").on("click", function(e) {
        moviestars.player.playPause();
      });

      $("#moviestars_volume").on("click", function(e) {
        muted = !muted;
        createjs.Sound.setMute(muted);

        if (muted)
          $("#moviestars_volume").css('background-image', "url(" + imgPath+ "assets/player/muted.png)");
        else
          $("#moviestars_volume").css('background-image', "url(" + imgPath+ "assets/player/volume.png)");
      });
    },
    rewind: function() {
      setTimeout(function() {
        timeline.setPosition(0);
        moviestars.paused = true;
        timeline.setPaused(moviestars.paused);
        for (i in soundInstance){
          soundInstance[i].play({offset:0});
          soundInstance[i].pause();
          $("#moviestars_play").css('background-image', "url(" + imgPath+ "assets/player/play.png)");
        }
        moviestars.player.showPaused();
      }, rewindDelay);
    },
    playPause: function() {
      for (i in soundInstance){
        soundInstance[i].paused ? soundInstance[i].resume() : soundInstance[i].pause();
      }
      moviestars.paused = !moviestars.paused;
      timeline.setPaused(moviestars.paused);
      moviestars.player.showPaused();
    },
    showPaused: function() {
      var showPlayButton = false;
      if (timeline.position == null || timeline.position == 0)
        showPlayButton = true;
      if (moviestars.paused) {
        $("#moviestars_play").css('background-image', "url(" + imgPath+ "assets/player/play.png)");
        if (!pauseIndex) {
          //var bmp = new createjs.Bitmap(imgPath + 'assets/player/play-button.png');
          var bmp = imgObject['playButtonFullscreen'];
          if (showPlayButton) {
            var newImage = moviestars.util.fillCanvasWithImage(bmp.image.width, bmp.image.height, screenWidth, screenHeight);
            //var newImage = moviestars.util.fitImageIntoCanvas(bmp.image.width, bmp.image.height, screenWidth, screenHeight);
            //bmp.scaleX = screenWidth / 512;
            //bmp.scaleY = screenHeight / 384;
            bmp.scaleX = newImage.width / bmp.image.width;
            bmp.scaleY = newImage.height / bmp.image.height;
            bmp.y = - (newImage.height - screenHeight) / 2;
            stage.addChild(bmp);
            pauseIndex = stage.getChildIndex(bmp);
            stage.update();
          }
        }
      } else {
        $("#moviestars_play").css('background-image', "url(" + imgPath+ "assets/player/pause.png)");
        if (pauseIndex) {
          stage.removeChildAt(pauseIndex);
          stage.update();
          pauseIndex = 0;
        }
      }
    },
    setPosSlider: function() {
      var ms = timeline.position;
      var curTime = moviestars.util.msToMinuteString(ms);
      var duration = moviestars.util.msToMinuteString(timeline.duration);
      $("#moviestars_posValue").text(curTime + ' / ' + duration);
      var newPos = ms/timeline.duration * (canvasWidth - controlButtonWidth*2);
      $("#moviestars_progress").width(newPos);
      $("#moviestars_slider").css('margin-left', newPos - 5 + 'px');
      moviestars.player.callStatServer(timeline.position/timeline.duration*100);
    },
    // canvas can't show gif animation, this has been replaced with 'loader' div in pure html
    showLoadingScreen: function() {
      var text = new createjs.Text("Loading...0%", "20px Arial", "#ff7700");
      text.x = Math.round((screenWidth-text.getMeasuredWidth())/2);
      text.y = Math.round(screenHeight/2);
      var bmp = new createjs.Bitmap(imgPath+ 'assets/player/preloader-logo.png');
      stage.addChild(text);
      stage.addChild(bmp);
      stage.update();
    },
    callStatServer: function(position) {
      for (var i=0, j=timeLineMilestone.length-1; i < j; i++) {
        if (i === timeLineMilestone.length-1) {
          var startVal = timeLineMilestone[i];
          var endVal = 100;
        } else {
          var startVal = timeLineMilestone[i];
          var endVal = timeLineMilestone[i+1];
        }
        if (position > startVal && position <= endVal && timeLineMilestone[i] !== statSent) {
          statSent = timeLineMilestone[i];
          if (endVal === 100)
            statisticValue = endVal;
          else
            statisticValue = startVal;
          var statUrl = trackUrl + 'get/moviestars/clicktracking/?exportDestinationID=' + edid
            + '&itemID=' + moviestars.jsonData.itemid
            + '&listingExtRefID=' + moviestars.jsonData.listingextrefid
            + '&statisticType=2&statisticValue=' + statisticValue
            + '&userHash=' + userHash;
          $.get(statUrl);
          return;
        }
      }
    }
  };

  // clip functions
  moviestars.clip = {
    load: function() {
      $.ajax({
        url: xmlUrl,
        dataType: 'json',
        success:function(data){
          moviestars.jsonData = data;
          if (moviestars.jsonData.listingextrefid.hasOwnProperty('@attributes')
            && moviestars.jsonData.listingextrefid['@attributes'].missingelement) {
            moviestars.jsonData.listingextrefid = '';
          }
          clipDuration = moviestars.jsonData.audio_duration_ms;
          $('#moviestars_loadVideo').removeAttr('disabled');
          userHash = moviestars.util.randomString(8, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
          moviestars.clip.init();
        },
        error:function(){
          console.log("Movie XML Data Load Error!!! " + xmlUrl);
//          alert("Movie XML Data Load Error!!! " + xmlUrl);
//          throw "Movie XML Data Load Error!!! " + xmlUrl;
          moviestars.clip.reload();
        }
      });
    },
    reload: function() {
      $('#moviestars_txtLoader').hide();
      $('#moviestars_reload').css('padding-left', $('#moviestars_txtLoader').css('padding-left'));
      $('#moviestars_reload').css('padding-left', '-=50'); // 50px adjustment because error message is longer than loading...
      $('#moviestars_reload').css('padding-top', $('#moviestars_txtLoader').css('padding-top'));
      $('#moviestars_reload').show();
    },
    init: function() {
      canvas = document.getElementById("moviestars_canvas");
      stage = new createjs.Stage(canvas);
      screenWidth = stage.canvas.width;
      screenHeight = stage.canvas.height;
      ratioAdjustmentK =  (screenWidth / screenHeight ) / (898 / 650); // original aspect ration, a bit less than 4:3 (because of the seek bar)
      ratioAdjustedHeight = screenHeight * ratioAdjustmentK;
      ratioAdjustedHeightDiff = customRatioHeightCrop * (ratioAdjustedHeight - screenHeight);
      /*
      if (canvasWidth)
        stage.scaleX = canvasWidth / screenWidth;
      if (canvasHeight)
        stage.scaleY = canvasHeight / screenHeight;
      stage.update();
      */
    //    showLoadingScreen(); // gif animation doesn't work in canvas
  //  if we move all player elements into a canvas, we can scale the player according to the canvas size
  //  currently player is built in html, therefore the size hardcoded to 512x384
//        console.log(screenWidth + 'x' + screenHeight);
      var queue = [];
      queue.push({id: "logo", src: moviestars.jsonData.logouri + '?' + userHash});
      queue.push({id: "sound1", src: moviestars.jsonData.audiouri + '?' + userHash});
      queue.push({id: "sound2", volume: moviestars.jsonData.backgroundaudiovolume/100, src: moviestars.jsonData.backgroundaudiouri + '?' + userHash});
      // preload big play button assets/player/play-button.png
      queue.push({id: "playButtonFullscreen", src: 'assets/player/play-button.png' + '?' + userHash});
      // it could be an array or one element in xml
      var photoSource = {};
      if (typeof moviestars.jsonData.photolist.photo.uri != 'undefined') {
        photoSource[0] = moviestars.jsonData.photolist.photo;
      } else {
        photoSource = moviestars.jsonData.photolist.photo;
      }
      for (i in photoSource) {
        var photoId = i;
        var photo = {};
        photo.id = photoId;
        photo.src = photoSource[i].uri + '?' + userHash;
        // if you need interaction with canvas objects (e.g. clicking on images) this line might be helpful
  //      photo.crossOrigin = location.protocol + '//' + location.host + '/';
        queue.push(photo);
      }
      for (i in moviestars.jsonData.visualobjectlist.visualobject) {
        var visualobject = moviestars.jsonData.visualobjectlist.visualobject[i];
        if ('url' in visualobject) {
          var item = {};
          item.id = 'vo' + i;
          item.src = visualobject.url + '?' + userHash;
          item.isvisualobject = 1;
          queue.push(item);
        }
      }
      var preload = new createjs.LoadQueue(false);
  //    var preload = new createjs.LoadQueue(); // will use XHR (doesn't work on ipad's and mac's safari)
      preload.installPlugin(createjs.Sound);
      preload.addEventListener("complete", preloadHandle.complete);
      preload.addEventListener("fileload", preloadHandle.fileLoad);
      preload.addEventListener("progress", preloadHandle.overallProgress);
  //    preload.addEventListener("fileprogress", handleFileProgress);
      preload.addEventListener("error", preloadHandle.fileError);
      preload.setMaxConnections(5);
      preload.stopOnError = true;
      createjs.LoadQueue.LOAD_TIMEOUT = 80000;//ms, 80s
      preload.loadManifest(queue);
    },
    make: function() {
      $(document).ready(moviestars.player.init);
      var tween = [];
      clipObject.animatePhotos(tween);
      clipObject.animateVisualObjects(tween);
      createjs.Ticker.setFPS(24);
      createjs.Ticker.addEventListener('tick', stage);
      timeline = new createjs.Timeline(tween);
      timeline.setPaused(true);
      $('#moviestars_loader').remove();
      $('#moviestars_canvasContainer').css('display', 'block');
      $('#moviestars_btnPlayPause').removeAttr('disabled');
      loaded = true;
  //    audioInterval = setInterval(player.setPosSlider, 30);
      audioInterval = setInterval(moviestars.player.setPosSlider, 10);
//      console.log(screenHeight);
      clipObject.setLogo();
      stage.update();
      moviestars.player.showPaused();
      if (pos) {
        var newPos = Math.round(pos);
        timeline.setPosition(newPos);
        for (i in soundInstance) {
          soundInstance[i].pause(); // chrome pause/resume issue fix
          soundInstance[i].play({offset:newPos});
          if (moviestars.paused)
            soundInstance[i].pause();
        }
      }
      if (autoplay) {
        moviestars.player.playPause();
      }
    },
    end: function() {
//      console.log('ClipEnd Call');

      for (i in soundInstance){
        soundInstance[i].pause();
      }
      if (timeline.duration <= timeline.position) {
//        console.log('THE END!!!!!!!!!!!!');
        createjs.Tween.get(stage).to({alpha:0.2}, rewindDelay).to({alpha:1}, rewindDelay/2);
        moviestars.player.rewind();
      }
    }
  };

  // clip objects manipulations
  var clipObject = {
    setPhoto: function(direction, bmp, action, duration) {
      if (action < 10) {
        var newImage = moviestars.util.fillCanvasWithImage(bmp.image.width, bmp.image.height, screenWidth*sizeFactor, screenHeight*sizeFactor);
        bmp.scaleX = newImage.width / bmp.image.width;
        bmp.scaleY = newImage.height / bmp.image.height;
        var delta = {};
        delta.x = bmp.scaleX*bmp.image.width - screenWidth;
        delta.y = bmp.scaleY*bmp.image.height - screenHeight;
      }
      var moveTo = [{},{},{}];
      switch (direction) {
        case 1:
          bmp.x = 0;
          bmp.y = -delta.y;
          moveTo[2].x = -delta.x;
          moveTo[2].y = 0;
          break;
        case 2:
          bmp.x = -delta.x/2;
          bmp.y = -delta.y;
          moveTo[2].x = -delta.x/2;
          moveTo[2].y = 0;
          break;
        case 3:
          bmp.x = -delta.x;
          bmp.y = -delta.y;
          moveTo[2].x = 0;
          moveTo[2].y = 0;
          break;
        case 4:
          bmp.x = 0;
          bmp.y = -delta.y/2;
          moveTo[2].x = -delta.x;
          moveTo[2].y = -delta.y/2;
          break;
        case 5:
          bmp.x = -delta.x/2;
          bmp.y = -delta.y/2;
          moveTo[2].x = -delta.x/2;
          moveTo[2].y = -delta.y/2;
          break;
        case 6:
          bmp.x = -delta.x;
          bmp.y = -delta.y/2;
          moveTo[2].x = 0;
          moveTo[2].y = -delta.y/2;
          break;
        case 7:
          bmp.x = 0;
          bmp.y = 0;
          moveTo[2].x = -delta.x;
          moveTo[2].y = -delta.y;
          break;
        case 8:
          bmp.x = -delta.x/2;
          bmp.y = 0;
          moveTo[2].x = -delta.x/2;
          moveTo[2].y = -delta.y;
          break;
        case 9:
          bmp.x = -delta.x;
          bmp.y = 0;
          moveTo[2].x = 0;
          moveTo[2].y = -delta.y;
          break;
        case 10:
          clipObject.setPhotoZoom(bmp, moveTo[2], 'in', zoomFactor);
          break;
        case 11:
          clipObject.setPhotoZoom(bmp, moveTo[2], 'out', zoomFactor);
          break;
        default :
          bmp.x = 0;
          bmp.y = 0;
          moveTo[2].x = 0;
          moveTo[2].y = 0;
      }
      duration = duration + 2*photoFadeInterval;
      moveTo[0].alpha = 1;
      moveTo[0].x = Math.round(bmp.x - ((bmp.x - moveTo[2].x)/duration)*photoFadeInterval );
      moveTo[0].y = Math.round(bmp.y - ((bmp.y - moveTo[2].y)/duration)*photoFadeInterval );

      moveTo[1].x = Math.round(bmp.x - ((bmp.x - moveTo[2].x)/duration)*(duration-photoFadeInterval));
      moveTo[1].y = Math.round(bmp.y - ((bmp.y - moveTo[2].y)/duration)*(duration-photoFadeInterval));

      moveTo[2].alpha = 0;
      return moveTo;
    },
    setPhotoZoom: function(bmp, moveTo, zoomType, zoomFactor) {
      var setParam = function(target, param) {
        target.x = param.x;
        target.y = param.y;
        target.scaleX = param.scaleX;
        target.scaleY = param.scaleY;
      }
      // first image (small)
      var img1 = {};
      var sizeF = sizeFactor;
      var newImage = moviestars.util.fillCanvasWithImage(bmp.image.width, bmp.image.height, screenWidth*sizeF, screenHeight*sizeF);
      img1.scaleX = newImage.width / bmp.image.width;
      img1.scaleY = newImage.height / bmp.image.height;
      var delta = {};
      delta.x =  img1.scaleX*bmp.image.width - screenWidth;
      delta.y =  img1.scaleY*bmp.image.height - screenHeight;
      img1.x = 0;
      img1.y = 0;
      // second image (big)
      var img2 = {};
      var sizeF = zoomFactor;
      var newImage = moviestars.util.fillCanvasWithImage(bmp.image.width, bmp.image.height, screenWidth*sizeF, screenHeight*sizeF);
      img2.scaleX = newImage.width / bmp.image.width;
      img2.scaleY = newImage.height / bmp.image.height;
      var delta = {};
      delta.x = img2.scaleX*bmp.image.width - screenWidth;
      delta.y = img2.scaleY*bmp.image.height - screenHeight;
      img2.x = -delta.x/2;
      img2.y = -delta.y/2;

      if (zoomType == 'in') {
        setParam(bmp, img1);
        setParam(moveTo, img2);
      } else {
        setParam(bmp, img2);
        setParam(moveTo, img1);
      }
    },
    setImageIn: function(transitionType, bmp, visualObject) {
      var newImage = moviestars.util.fitImageIntoCanvas(bmp.image.width, bmp.image.height, screenWidth, screenHeight);
      bmp.scaleX = newImage.width / bmp.image.width;
      bmp.scaleY = newImage.height / bmp.image.height;
      var moveTo = {};
      switch (transitionType) {
        case 'fade':
          visualObject.flyinduration = visualObjectFadeInDuration;
          bmp.alpha = 0;
          bmp.x = 0;
          bmp.y = ratioAdjustedHeight*visualObject.top/100 + ratioAdjustedHeightDiff;
          moveTo.alpha = 1;
          break;
          bmp.x = 0;
          bmp.y = ratioAdjustedHeight*visualObject.top/100 + ratioAdjustedHeightDiff;
          moveTo.y = screenHeight*visualObject.top/100;
          break;
        case 'fly-from-top':
          bmp.x = 0;
          bmp.y = -bmp.image.height + ratioAdjustedHeightDiff;
          moveTo.y = screenHeight*visualObject.top/100;
          break;
        case 'fly-from-right':
//          bmp.x = screenWidth + bmp.image.width;
          bmp.x = screenWidth + newImage.width;
          bmp.y = ratioAdjustedHeight*visualObject.top/100 + ratioAdjustedHeightDiff;
          moveTo.x = 0;
          break;
        case 'fly-from-left':
//          bmp.x = -bmp.image.width;
          bmp.x = -newImage.width;
          bmp.y = ratioAdjustedHeight*visualObject.top/100 + ratioAdjustedHeightDiff;
          moveTo.x = 0;
          break;
        default :
          bmp.x = screenWidth*visualObject.left/100;
          bmp.y = ratioAdjustedHeight*visualObject.top/100 + ratioAdjustedHeightDiff;
          bmp.alpha = 0;
          moveTo.alpha = 1;
          break;
      }      return moveTo;
    },
    setImageOut: function(transitionType, bmp) {
      var moveTo = {};
      switch (transitionType) {
        case 'fly-to-top':
          moveTo.y = -bmp.image.height;
          break;
        case 'fly-to-bottom':
          moveTo.y = screenHeight;
          break;
        case 'fly-to-left':
          moveTo.x = -bmp.image.width;
          break;
        case 'fly-to-right':
          moveTo.x = screenWidth;
          break;
        default :
          moveTo = {};
          break;
      }
      return moveTo;
    },
    setStartTime: function(startTimeType, startTimeMs) {
      switch (startTimeType) {
        case 'beforeend':
          return clipDuration - startTimeMs;
          break;
        case 'fromstart':
        default :
          return startTimeMs;
          break;
      }
    },
    animatePhotos: function(tween) {
      var totalDuration = 0;
      var totalPhoto = Object.keys(moviestars.jsonData.photolist.photo).length;
      for (i in moviestars.jsonData.photolist.photo) {
        var moveTo = clipObject.setPhoto(moviestars.jsonData.photolist.photo[i].action*1, imgObject[i], moviestars.jsonData.photolist.photo[i].action, moviestars.jsonData.photolist.photo[i].duration_ms*1);
        // hide all photos, but the first
        if (i != 0)
          imgObject[i].alpha = 0;
        stage.addChild(imgObject[i]);
        stage.update();
        var tweenObj = {};

        if ('scaleX' in moveTo)
          tweenObj = createjs.Tween.get(imgObject[i], {paused:true}).wait(totalDuration).to({alpha:1}, photoFadeInterval).to({scaleX:moveTo.scaleX, scaleY:moveTo.scaleY, x:moveTo[0].x, y:moveTo[0].y}, moviestars.jsonData.photolist.photo[i].duration_ms*1);
        else
          tweenObj = createjs.Tween.get(imgObject[i], {paused:true}).wait(totalDuration).to(moveTo[0], photoFadeInterval).to(moveTo[1], moviestars.jsonData.photolist.photo[i].duration_ms*1);

        if ((i*1+1)<totalPhoto)
          tweenObj = tweenObj.to(moveTo[2], photoFadeInterval);
        else {
          tweenObj = tweenObj.call(moviestars.clip.end);
        }
        tween.push(tweenObj);
        totalDuration = totalDuration + moviestars.jsonData.photolist.photo[i].duration_ms*1;
      }
    },
    // adding visual objects (images & texts)
    animateVisualObjects: function(tween) {
    for (i in moviestars.jsonData.visualobjectlist.visualobject) {
      var id = 'vo' + i;
      var tweenObj = {};
      visualobject = moviestars.jsonData.visualobjectlist.visualobject[i];
      // setting effect durations (input xml data isn't consistent)
      if ( 'flyinduration' in visualobject )
        visualobject.flyinduration = visualobject.flyinduration*1;
      else
        visualobject.flyinduration = 1;
      if ( 'flyoutduration' in visualobject )
        visualobject.flyoutduration =visualobject.flyoutduration*1;
      else
        visualobject.flyoutduration = 1;

      var startTime = clipObject.setStartTime(visualobject.starttimetype, visualobject.starttimems*1);
      if (id in imgObject) {   // Visual Object is an image
        var moveTo = clipObject.setImageIn(visualobject.transitiontypein, imgObject[id], visualobject);
        stage.addChild(imgObject[id]);

        waitDuration = visualobject.durationms*1 - visualobject.flyinduration - visualobject.flyoutduration;

        var alpha = 0;
        // if visual object duration is longer than whole clip duration
        if (clipDuration < (startTime + waitDuration)) {
          waitDuration = moviestars.jsonData.audio_duration_ms - startTime;
          alpha = 1;
        }
//        visualobject.flyinduration = 1000;
        tweenObj = createjs.Tween.get(imgObject[id], {paused:true}).wait(startTime).to(moveTo, visualobject.flyinduration);

        if ( (wipeEffects.indexOf(visualobject.transitiontypein) >-1 )
          || (wipeEffects.indexOf(visualobject.transitiontypeout) >-1 ) ) {
          tweenObj.on("change", clipObject.wipeEffect, null, false, {vo: visualobject, bmp: imgObject[id]});
          //fake alpha mask - first step in wiping effect
          if ( wipeEffects.indexOf(visualobject.transitiontypein) >-1 )
          {
            imgObject[id].alpha = 1;
            var box = new createjs.Shape();
            box.graphics.beginLinearGradientFill(["#FFFFFF", "rgba(0, 0, 0, 0)"], [0, 0], 0, 0, 1, 1)
            box.graphics.drawRect(0, 0, 1, 1);
            box.cache(0, 0, 1, 1);
            imgObject[id].filters = [
              new createjs.AlphaMaskFilter(box.cacheCanvas)
            ];
            imgObject[id].cache(0, 0, 1, 1);
            stage.update();
          }
        }
        var moveTo = clipObject.setImageOut(visualobject.transitiontypeout, imgObject[id]);
        tweenObj.wait(waitDuration);
        tweenObj.to(moveTo, visualobject.flyoutduration);
        tweenObj.to({alpha:alpha}, 0);
        tween.push(tweenObj);
      // Visual Object is a text
      } else if (visualobject.visualobjecttype == 'text') {
//visualobject.fontsize = Math.round(screenHeight - screenHeight*visualobject.top/96);
        //visualobject.fontsize = Math.round(screenHeight*(visualobject.height-2)/100); // object height minus 2% for padding
        visualobject.fontsize = Math.round(ratioAdjustedHeight*(visualobject.height-2)/100); // object height minus 2% for padding
        var text = new createjs.Text(visualobject.textcontent, visualobject.fontsize + 'px ' + visualobject.fontface, moviestars.util.rgbToHex(visualobject.fontcolour.r*1, visualobject.fontcolour.g*1, visualobject.fontcolour.b*1));
        text.x = screenWidth*visualobject.left/100;
        //text.y = screenHeight*visualobject.top/100;
        text.y = ratioAdjustedHeight*visualobject.top/100 + ratioAdjustedHeightDiff;
        text.alpha = 0;
        stage.addChild(text);

        if (visualobject.movementtype == 'scrollinghorizontal')
          tweenObj = createjs.Tween.get(text, {paused:true}).wait(startTime).to({alpha:1},1).to({x:-text.getMeasuredWidth()}, visualobject.durationms*1).to({alpha:0}, 1);
        else
          tweenObj = createjs.Tween.get(text, {paused:true}).wait(startTime).to({alpha:1},1).wait(visualobject.durationms*1-visualObjectFadeOutDuration).to({alpha:0}, visualObjectFadeOutDuration);
      }
      tween.push(tweenObj);
    }
  },
    // putting logo in the upper right corner (no settings in xlm data)
    setLogo: function() {
//      imgObject['logo'].x = screenWidth - imgObject['logo'].image.width*1.05;
      imgObject['logo'].x = 0;
      imgObject['logo'].y = 0;
//      imgObject['logo'].y = seekBarHeight;
      imgObject['logo'].alpha = 0.7;
      stage.addChild(imgObject['logo']);
    },
    wipeEffect: function(event, data) {
      // wiping in
        var startTimeIn = clipObject.setStartTime(data.vo.starttimetype, data.vo.starttimems*1);
        var startTimeOut = startTimeIn + data.vo.durationms*1 - visualObjectWipeOutDuration;
        // wiping in
        if ( (wipeEffects.indexOf(data.vo.transitiontypein) >-1 )
        && timeline.position > startTimeIn
        && (timeline.position < (startTimeIn + visualObjectWipeInDuration)) ) {
          clipObject.addFilter(event, (timeline.position-startTimeIn)/visualObjectWipeInDuration, data.bmp, data.vo.transitiontypein, 'in');
        } else if ( data.bmp.alpha && (timeline.position < startTimeIn) ) {
          data.bmp.alpha = 0;
        // wiping out
        } else if ( (wipeEffects.indexOf(data.vo.transitiontypeout) >-1 ) && timeline.position > startTimeOut ) {
          clipObject.addFilter(event, (timeline.position-startTimeOut)/visualObjectWipeOutDuration, data.bmp, data.vo.transitiontypeout, 'out');
//        } else if ( !data.bmp.alpha && (timeline.position < startTimeOut) ) {
        // static image
        } else if ( data.bmp.cacheID ) {
          data.bmp.filters = []; // removing filters
          data.bmp.updateCache();
          stage.update(event);
        }
    },
    addFilter: function(event, position, bmp, wipeType, inOut) {
//      var d = 50;  // gradient area
      switch (wipeType) {
        case 'wipe-from-top':
          var length = bmp.image.height;
          var offset = length/5;
          var d = length/10;
          var t = offset + length*position;
          var x0 = 250;
          var y0 = t-offset;
          var x1 = 250;
          var y1 = t-offset+d;
          break;
        case 'wipe-from-bottom':
          var length = bmp.image.height;
          var offset = length/5;
          var d = length/10;
          var t = length + offset - length*position;
          var x0 = 250;
          var y0 = t-offset+d;
          var x1 = 250;
          var y1 = t-offset;
          break;
        case 'wipe-from-right':
          var length = bmp.image.width;
          var offset = length/5;
          var d = length/10;
          var t = length + offset - length*position;
          var x0 = t-offset+d;
          var y0 = 50;
          var x1 = t-offset;
          var y1 = 50;
          break;
        case 'wipe-from-left':
        default :
          var length = bmp.image.width;
          var offset = length/5;
          var d = length/10;
          var t = offset + length*position;
          var x0 = t-offset;
          var y0 = 50;
          var x1 = t-offset+d;
          var y1 = 50;
          break;
      }
      if (inOut == 'in')
        ratios = [0,1];
      else
        ratios = [1,0];
      var box = new createjs.Shape();
      box.graphics.beginLinearGradientFill(["#FFFFFF", "rgba(0, 0, 0, 0)"], ratios, x0, y0, x1, y1)
      box.graphics.drawRect(0, 0, screenWidth, 100);
      box.cache(0, 0, screenWidth, 100);
      bmp.filters = [
          new createjs.AlphaMaskFilter(box.cacheCanvas)
      ];
      bmp.cache(0, 0, screenWidth, 100);
      stage.update(event);
    }
  };

  if (autoload)
    moviestars.clip.load();

};
