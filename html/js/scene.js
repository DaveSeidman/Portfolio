"use strict";

var light1, light2, camera, camNear = 70, camFar = 400, scene, renderer, mesh, flatMaterial, camTarget = new THREE.Vector3(), models = [], modelColor, modelColors = [], backgroundColor, backgroundColorRGB, backgroundColors = [];

var camOffset = { x:0, y:0, z:150 };
var WIDTH, WINWIDTH, HEIGHT, clientX, clientY, wheelTimeout, accXraw = 0, accYraw = 0, accXsmooth = 0, accYsmooth = 0, factor = 0.5;

var touchStartX, touchStartY, touchMoved;

var webGL;

// flags
var updateVertices;
var isIE;

var dots, items, currentItem, currentProject = undefined;			

//var titlePad = 40;
var hash = "";
var sounds;
var toneArray = [], tones = ["audio/tone1.mp3", "audio/tone2.mp3", "audio/tone3.mp3", "audio/tone4.mp3"];

var imgTimelineDelay = 5;

var carousel = {};
carousel.xTarget = 0;
carousel.total = 0;
carousel.width = 0;
carousel.spacing = 0;
carousel.current = 0;		// current mesh
carousel.adjustedCurrent = 0; // moving carousel left only updated current once the next item is completely in the center of the screen, adjustedCurrent basically uses Math.round instead of Math.floor
carousel.prevAdjustedCurrent = -1;	// by keeping track of old value we know when this changes.
carousel.next = 1;			// morph-to mesh
carousel.morph = 0;			// amount to morph
carousel.dragging = false;	
carousel.freeze = false;	// difference between lock and freeze?
carousel.moved = false;
carousel.last = 0;
carousel.speed = 0;
carousel.rotation = 0;
carousel.offset = 0;		// how far left or right carousel is pushed
carousel.localOffset = 0;	// "cycled" value for previous
carousel.start = 0;
carousel.drags = 0;			// used to decide whether or not to calculate rotation, waits for three pointer movements before beginning to add acceleration

var simplex = new SimplexNoise(), start = Date.now(), now = Date.now(), time = 0, speed = 2500, magnitude = .1;

var wrapEl, canvasEl, carouselEl, preloadEl, headerEl, nextPrevButtons, footerEl, footerButtons, footerContent, vignetteEl, closeFooterBtn, debugEl, categoryDev, categoryDsn;

var debugging = false;

var material_depth;
var postprocessing = {};

var composer, bokehPass,renderPass;

var ga;




$(document).on("ready", init);

function init() {

	if(debugging) console.log("initialize program");
	isIE = (navigator.userAgent.indexOf("MSIE") > 0);

	wrapEl = $(".wrap");
	carouselEl = $(".carousel");
	dots = $(".dot");
	items = $(".item"); // will bomb out if there's not exactly 1 item for every dot
	headerEl = $(".header");
	footerEl = $(".footer");
	preloadEl = $(".preload");
	footerButtons = $(".footer .nav a");
	footerContent = $(".footerContent");
	closeFooterBtn = $(".footerClose");
	debugEl = $(".debug");
	nextPrevButtons = $(".nextButton, .prevButton");
	vignetteEl = $(".vignette");
	if(isIE) vignetteEl.remove();
	categoryDev = $($(".category")[0]);
	categoryDsn = $($(".category")[1]);

	categoryDev.data("inner", categoryDev.find("p"));
	categoryDsn.data("inner", categoryDsn.find("p"));

	WIDTH = carouselEl.width();
	HEIGHT = window.innerHeight;

	carousel.total = dots.length;
	carousel.spacing = WIDTH/3;
	carousel.width = carousel.spacing * carousel.total;
	
	setupScene();	
	setupEvents();
	processHTML();
	updatePosition();
	resized();
 	loadMesh();

 	if(!isIE) if(window.location.hash.length) hash = window.location.hash.substr(1).toLowerCase();

 	TweenMax.defaultOverwrite = "all";

 	sounds.load(tones);
	sounds.whenLoaded = setupSound;
}

function setupSound() {

 	$(tones).each(function() {

 		var tone = sounds[this];
 		tone.volume = .1;
 		toneArray.push(tone);
 	});
}

function setupEvents() {

	if(debugging) console.log("setupEvents");

	window.addEventListener("resize", debouncedResize, false);
	window.addEventListener("pointerdown", pointerDown, false);
	window.addEventListener("pointermove", pointerMove, false);
	window.addEventListener("pointerup", pointerUp, false);
	window.addEventListener("pointerleave", pointerUp, false); // is this firing? use a helper function to check.
	window.addEventListener("devicemotion", deviceMotion);
	window.addEventListener("mousemove", mouseMotion);
	window.addEventListener("wheel", wheelMotion);
	$(window).on("hashchange", hashChanged);
	footerButtons.on("click", openFooter);
	//window.addEventListener("hashchange", hashChanged, false);
}


function setupScene() {

	if(debugging) console.log("setupScene");

	webGL = webglAvailable();
	if(webGL) { renderer = new THREE.WebGLRenderer({ antialias: true }); if(debugging) console.log("webgl available, creating webgl renderer"); }
	else { renderer = new THREE.CanvasRenderer({ antialias: false }); if(debugging) console.log("webgl unavailable, creating canvas renderer"); }

	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( 0xF3F2E2, 1 );
	//renderer.autoClear = false;
	canvasEl = $(renderer.domElement);
	scene = new THREE.Scene();
   	scene.fog = new THREE.Fog(0xFFFFFF,60,150);
	camera = new THREE.PerspectiveCamera( 50, window.innerWidth / HEIGHT , camNear, camFar);
	
	camera.position.z = camOffset.z;
	camera.lookAt(new THREE.Vector3);
 	flatMaterial = new THREE.MeshLambertMaterial({ color:"rgb(100,140,220)", shading:THREE.FlatShading });
	light1 = new THREE.PointLight(0xffffff, webGL ? 8 : 4, 325);
	light2 = new THREE.PointLight(0xffffff, webGL ? 3 : 1, 325);
	light1.position.set(150,150,-50);
	light2.position.set(-20,-30,220);
	scene.add(light1,light2);
	//scene.add(light2);
	wrapEl.prepend(canvasEl);	


	material_depth = new THREE.MeshDepthMaterial();
	//scene.matrixAutoUpdate = false;
	if(webGL) initPostprocessing();
}

function initPostprocessing() {

	renderPass = new THREE.RenderPass( scene, camera );

	bokehPass = new THREE.BokehPass( scene, camera, {
		focus: 1.0,
		aperture: 0.05,
		maxblur: 5.0,
		width: WIDTH,
		height: HEIGHT
	});

	bokehPass.renderToScreen = true;
	composer = new THREE.EffectComposer( renderer );
	composer.addPass( renderPass );
	composer.addPass( bokehPass );
	postprocessing.composer = composer;
	postprocessing.bokeh = bokehPass;
}




function processHTML() {

	if(debugging) console.log("processHTML");

	for(var i = 0; i < carousel.total; i++) {

		var dot = $(dots[i]);
		dot.data("offset", 0);
		models.push(dot.attr("data-model"));
		modelColors.push(new THREE.Vector3(Number(dot.attr("data-foreground").split(',')[0])/255, Number(dot.attr("data-foreground").split(',')[1])/255, Number(dot.attr("data-foreground").split(',')[2])/255));
		backgroundColors.push(new THREE.Vector3(Number(dot.attr("data-background").split(',')[0])/255, Number(dot.attr("data-background").split(',')[1])/255, Number(dot.attr("data-background").split(',')[2])/255));

		var item = $(items[i]);

		item.addClass("noselect");
		item.data({"carouselID":i, "open":false});
		
		if(!item.hasClass("intro")) {

			item.data("height", item.height());

			var plus = $('<div class="plus"><img src="images/plus.png"></div>');
			item.data("plusEl", plus);
			
			item.data("plusOffset", parseInt($(item.find("h1")[0]).attr("data-plus-offset")));
			item.append(plus);
			plus.css({"position":"absolute", "right":item.data("plusOffset")});
			item.data("titleEl", item.find(".title"));
			item.data("contentEl", item.find(".content"));
			item.data("contentEl").css("top", item.data("titleEl").height() + 30);
			item.data("projects", item.find(".project"));
			item.data("imagesLoaded", false);
			
			item.data("projects").each(function() {

				var project = $(this);
				var imgScroller = project.find(".imgScroller");
				var images = imgScroller.find("img");
				var imgTimeline = new TimelineMax({ delay:0, repeat:-1, repeatDelay:0 });
				var info = project.find(".info");
				
				project.data("imgTimeline", imgTimeline);
				project.data("imgScroller", imgScroller);
				project.data("images", images);
				project.data("info", info);

				imgTimeline.pause();
				for(var i = 0; i < images.length; i++) {
					var j = i + 1;
					if(j == images.length) j = 0;
					imgTimeline.to(images[i], .5, { css: { top:"100%" }, ease:Power2.easeInOut }, imgTimelineDelay*(i+1) - .5);
					imgTimeline.to(images[j],  0, { css: { visibility:"visible" } }, imgTimelineDelay*(i+1) -.5);
					imgTimeline.to(images[j], .5, { css: { top:"0%" }, ease:Power2.easeInOut }, imgTimelineDelay*(i+1) -.5);
					imgTimeline.to(images[i],  0, { css: { top:"-100%" } }, (imgTimelineDelay*(i+1)));
				}
			});
		}
		else {

			item.data("sphere", item.find(".sphere"));
			item.data("therest", item.find(".therest"));
		}
	}

	footerContent.find("div").each(function() {	$(this).css("left", $(this).index() * 100 + "%"); }); // offset footer content
}

function loadMesh() {	// this loads the first model with all it's geometry

	if(debugging) console.log("loadMesh");
	var loader = new THREE.JSONLoader();
	loader.load(models[0], function ( geometry ) {

		var verts = [];
		var norms = [];
		mesh = new THREE.Mesh(geometry, flatMaterial);
		mesh.geometry.verts = [];
		mesh.geometry.norms = [];
		mesh.geometry.normals = [];
		mesh.geometry.dynamic = true;
		scene.add(mesh);
		loadModel(0);
	});
}

function loadModel(index) {	// this loads only the vertex and normal info for the rest of the models

	if(debugging) console.log("loadModel", index);

	preloadEl.find("p").html("Loading Projects: " + (index > 1 ? index - 1 : 1)  + " of " + (carousel.total - 2));

	jQuery.getJSON(models[index], function(data) {

		var verts = [];
		var vertices = data.vertices;
		for(var v = 0; v < vertices.length; v += 3) {
			var vertex = new THREE.Vector3(vertices[v], vertices[v+1], vertices[v+2]);
			verts.push(vertex);
		}
		mesh.geometry.verts.push(verts);

		var norms = [];
		var normals = data.normals;
		for(var n = 0; n < normals.length; n += 3) {
			var normal = new THREE.Vector3(normals[n], normals[n+1], normals[n+2]);
			norms.push(normal);
		}
		mesh.geometry.norms.push(norms);
		
		index++;
		if(index < models.length) loadModel(index);
		else createCarousel();
	});
}

function createCarousel() {

	if(debugging) console.log("createCarousel");

	carousel.offset += carousel.spacing; // push carousel one item to the right so we start on intro

	updatePosition();
	animate();
	updatePosition();
	
	TweenLite.to(preloadEl, .5, { css: { opacity:0 }});
	TweenLite.to(carouselEl, 1, { css: { opacity: 1 }, delay:1.5 });
	TweenLite.to(canvasEl, 1, { css: { opacity: 1 }, delay:.5 });
	TweenLite.to(footerEl, .5, { css: { height:50 }, delay:2 });
	setTimeout(function() { carousel.freeze = false; carouselEl.scrollLeft(0); }, 1500);

	carouselEl.scrollLeft(0);
	wrapEl.scrollLeft(0);
	footerEl.scrollLeft(0);
	setTimeout(checkHash, 2500);

	camera.far = 150;	// DS for some reason can't do this on init, have to wait until after scene loads


}




















function pointerDown(event) {

	if(debugging) console.log("pointerdown", event);
	clientX = event.clientX;
	carousel.start = clientX - carousel.offset;
	carousel.dragging = true;
	carousel.speed = 0;
	TweenLite.killTweensOf(carousel);
	carousel.moved = false;
	carousel.drags = 0;
	touchStartX = event.clientX;
	touchStartY = event.clientY;
	touchMoved = false;
}

function pointerMove(event) {

	//if(debugging) console.log("pointermove");
	if(!carousel.freeze) {
		
		carousel.drags++;

		if(clientX != event.clientX  && carousel.dragging) {
			carousel.moved = true;
			clientX = event.clientX;
			if(carousel.drags > 0) carousel.speed = clientX - carousel.last;
			if(carousel.drags > 2) carousel.rotation += carousel.speed / (WIDTH/400); 
			carousel.offset = clientX - carousel.start;
			carousel.last = clientX;
			updatePosition();
		}
		event.preventDefault();
	}
	if(Math.abs(touchStartX - event.clientX) + Math.abs(touchStartY - event.clientY) > 10) touchMoved = true;
}

function pointerUp(event) {

	//if(debugging) console.log("pointerUp", event);
	carousel.dragging = false;

	if(!carousel.freeze) finishTurn();
	
	if(!touchMoved) {

		var target = $(event.target);
		if(!currentItem.data("open")) { // no open items
			if(target.parents(".item").length) { // clicked on an item
				var itemClicked = $(target.parents(".item")[0]);
				if(itemClicked.data("carouselID") == carousel.adjustedCurrent && !itemClicked.hasClass("intro")) { // item clicked was in center
					openItem(itemClicked);
					finishTurn();
				}
				else { // item clicked was either right or left of center
					var push = (event.clientX < WIDTH/2) ? carousel.spacing : -carousel.spacing;
					carousel.rotation += push/5;
					carousel.speed += push/20;
					finishTurn();
				}
			}
		}
		else { // an item is open
			if(target.parents(".plus").length) { // plus/X clicked
				if(currentProject) { // a project is open
					if(currentItem.data("projects").length == 1) closeItem(currentItem); // featured project was open so close item
					else closeProject(currentProject);
				}
				else closeItem(currentItem);
			}
			if(target.parents(".project").length && !currentProject) openProject($(target.parents(".project")[0]));
			if(target.parents(".imgScroller").length) switchImage(target); // DS this is being called when opening a project
		}
		if(target.parents(".header").length && !carousel.freeze) goHome();
		if(target.parents(".footerClose").length) closeFooter();
	}
}

function finishTurn() {

	var target = Math.round((carousel.offset + (carousel.speed*20))/carousel.spacing) * carousel.spacing;
	var distance = Math.abs(target - carousel.offset);
	if(distance > 0 && distance < 2000) TweenMax.to(carousel, 1, { offset:target, ease:Power2.easeOut, onUpdate:updatePosition });
}


























function openItem(item) {

	if(debugging) console.log("open item");
	carousel.freeze = true;
	//var dot = $(item.parent());
	
	carouselEl.append(item.parent()); // bring item to to front
	item.data("open", true);
	
	items.each(function() {	if(this != currentItem[0]) TweenMax.to(this, 1, { css: { opacity:0 }} ); }); // fade out all items except for current

	item.css("cursor", "auto");
	TweenMax.to(item, 1, { css: { width:window.innerWidth, height:HEIGHT-60, top:(HEIGHT - 60)/-2, marginLeft:-window.innerWidth/2, marginTop:0 }, ease:Power2.easeInOut });
	TweenMax.to(item.data("plusEl"), 2, { css: { rotation:"135_cw" }, ease:Elastic.easeInOut });
	TweenMax.to(item.data("plusEl"), 1, { css: { top:30, right:10 }, ease:Power2.easeInOut });
	TweenMax.to(item.data("titleEl"), 1, { css: { paddingTop:40, transform:"scale(.75)" }, ease:Power2.easeInOut });
	TweenMax.to(item.data("contentEl"), 1, { css: { bottom:0 }, ease:Power2.easeInOut });
	item.data("contentEl").css("overflow-y","scroll");
	
	if(!item.data("imagesLoaded")) loadImages(item);

	if(item.data("projects").length > 1) { // normal projects page, multiple projects
		
		item.data("projects").each(function() {	showProject($(this)); });
	}
	else {	// featured projects page, single project

		currentProject = $(item.data("projects")[0]);
		TweenMax.fromTo(currentProject, .5, { css: { opacity:0 }}, { css: { opacity:1 }});
		if(item.find(".vimeo").length) {
			var vimeo = item.find(".vimeo");
			vimeo.addClass("openVimeo");
			setTimeout(function() { vimeo.height((vimeo.width() * 9)/16); }, 1000);
		}
	}

	TweenMax.to(camOffset, 1, { y:60, z:120, onUpdate:updateCam, ease:Power2.easeInOut });
	TweenMax.to(camTarget, 1, { y:60, ease:Power2.easeInOut });
	TweenMax.to(scene.fog, 1, { near:0, far:100, ease:Power2.easeInOut });
	TweenMax.to(camera, 1, { near:5, far: 150, ease:Power2.easeInOut });
	
	if(!isIE) window.history.pushState('Object', 'Title', './#' + item.attr("id"));
	ga('send', 'pageview', '/' + item.attr("id"));
}

function showProject(project) {
	
	var index = project.index();
	var delay = 1000 + index * 200 - ((index*index) * 5)
	var imgScroller = project.data("imgScroller");
	var imgTimeline = project.data("imgTimeline");

	setTimeout(function() { 
		TweenMax.to(project, .5, { css: { height:((project.width() * 9)/16) + 30 }, ease:Power2.easeInOut }); 
		TweenMax.to(imgScroller, .5, { css: { height:((project.width() * 9)/16) }, ease:Power2.easeInOut }); 
		imgTimeline.time(0); 
		imgTimeline.play();
	}, delay);
}

function closeItem(item) {

	if(debugging) console.log("close item");
	carousel.freeze = false;

	item.data("open", false);

	item.css("cursor", "pointer");
	TweenMax.to(item, 1, { css: { width:300, height:item.data("height"), top:0, marginLeft:-150, marginTop:item.data("height")/-2 }, ease:Power2.easeInOut });
	TweenMax.to(item.data("plusEl"), 2, { css: { rotation:"0_ccw" }, ease:Elastic.easeInOut });
	TweenMax.to(item.data("plusEl"), 1, { css: { top:-4, right:item.data("plusOffset") }, ease:Power2.easeInOut });
	TweenMax.to(item.data("titleEl"), 1, { css: { paddingTop:0, transform:"scale(1)" }, ease:Power2.easeInOut });
	TweenMax.to(item.data("contentEl"), 1, { css: { bottom: window.innerHeight - 60 - item.data("titleEl").height() }, ease:Power2.easeInOut, onComplete:closeItemAfter, onCompleteParams:[item] });
	item.data("contentEl").animate({scrollTop:0}, 1000); // DS: use TweenMax for this?	

	if(currentProject) {
		if(item.data("projects").length > 1) closeProject(currentProject);
	}

	if(item.find(".vimeo").length) resetVimeo(item); // force vimeo to pause by removing and adding

	if(item.data("projects").length > 1) {
		item.data("projects").each(function() {	

			var project = $(this);
			setTimeout(function() { project.css("height",0); }, 1000);
			project.data("imgTimeline").pause();
		});
	}

	TweenMax.to(camOffset, 1, { y:0, z:150, onUpdate:updateCam, ease:Power2.easeInOut });
	TweenMax.to(camTarget, 1, { y:0, ease:Power2.easeInOut });
	TweenMax.to(scene.fog, 1, { near:60, far:150, ease:Power2.easeInOut });
	TweenMax.to(camera, 1, { near:camNear, far:camFar, ease:Power2.easeInOut });

	items.each(function() {

		var item = $(this);
		if(this != currentItem[0] && !item.hasClass("intro")) TweenMax.to(this, .5, { css: { opacity:0.175 }} ); 
		if(item.hasClass("intro")) {
			TweenMax.to(item, 1, { opacity:1 });
			TweenMax.to(item.data("therest"), 1, { opacity:0 });
		}
	});

	if(currentProject) currentProject = undefined;

	if(!isIE) window.history.pushState('Object', 'Title', './');
}
function closeItemAfter(item) {

	item.data("contentEl").css("overflow-y","hidden");
}


function updateCam() {

	camera.position.x = camOffset.x + accXsmooth;
	camera.position.y = camOffset.y + accYsmooth;
	camera.position.z = camOffset.z - ((1 - Math.cos(accYsmooth/30)) * 12);
	camera.lookAt(camTarget);
}




















function openProject(prj) {

	console.log("opening project", prj);
	if(debugging) console.log("open project", event);

	currentProject = prj;
	if(debugging) console.log("openProject", currentProject);
	
	// close all projects
	var i = 0;
	var delay;
	currentItem.data("projects").each(function() {

		delay = i * 100 - ((i*i) * 5); // DS, test with 9 or more projects, timing may not work
		var project = $(this);
		var imgTimeline = project.data("imgTimeline");
		imgTimeline.pause(); // DS: might look weird if pausing in middle of transition, could add to delayed call
		setTimeout(function() { TweenMax.to(project, .25, { css: { opacity:0 }}); }, delay);
		i++;
	});
	setTimeout(openProjectAfter, delay+260, currentProject);

	if(!isIE) window.history.pushState('Object', 'Title', './' + window.location.hash + '/' + currentProject.attr("id"));
	ga('send', 'pageview', '/' + $(items[carousel.adjustedCurrent]).attr("id") + '/' + currentProject.attr("id"));
}
function openProjectAfter(project) {

	if(debugging) console.log("showProject", project);
	project.addClass("openProject");
	project.data("imgScroller").addClass("openImgScroller");
	project.data("info").addClass("openInfo");
	currentItem.data("projects").each(function() { $(this).css("display","none"); });
	currentItem.data("contentEl").scrollTop(0);
	project.css("display", "inline-block");
	TweenMax.to(project, .5, { css: { opacity:1 } });
}

function closeProject(prj) {

	if(debugging) console.log("closeProject");

	TweenMax.to(currentProject, .25, { css: { opacity:0 }, onComplete:closeProjectAfter, onCompleteParams:[currentProject] });

	// open all projects
	var i = 0;
	var delay;
	currentItem.data("projects").each(function() {

		delay = 260 + i * 100 - ((i*i) * 5); // DS, test with 9 or more projects, timing may not work
		var project = $(this);
		var imgTimeline = project.data("imgTimeline");
		var imgScroller = project.data("imgScroller");

		project.css("display", "inline-block");

		setTimeout(function() { 
			TweenMax.to(project, .25, { css: { opacity:1 }});
			imgTimeline.time(0); 
			imgTimeline.play();
		}, delay);
		i++;
	});

	if(!isIE) window.history.pushState('Object', 'Title', window.location.href.substring(0, window.location.href.lastIndexOf('/'))); // trim last project from location string
}

function closeProjectAfter(project) {

	if(debugging) console.log("hideProject", project);

	var images = project.data("images");
	var imgScroller = project.data("imgScroller");
	imgScroller.empty();
	images.each(function() { 
		imgScroller.append(this);
	});

	project.removeClass("openProject");
	project.data("imgScroller").removeClass("openImgScroller");
	project.data("info").removeClass("openInfo");
	project.data("imgScroller").css("height", ((project.width() * 9)/16));
	project.css("height", ((project.width() * 9)/16) + 30);
	currentProject = undefined;
}



function switchImage(image) {

	if(debugging) console.log("switchImage", event.target);
	//var image = $(this);
	var container = image.parent();
	if(container.hasClass("openImgScroller")) {

		image.remove();
		container.prepend(image);
	}
}



















function openFooter(event) {

	if(debugging) console.log("openFooter", event);
	
	carousel.freeze = true;

	if($(this).attr("id") != "resume") {

		TweenMax.to(footerContent, (closeFooterBtn.css("opacity") == 0) ? 0 : .5, { css: { left:$(this).index() * -100 + "%" }, ease:Power2.easeInOut });

		$(footerContent.find("div")[$(this).index()]).scrollTop(0);
		footerButtons.each(function() {	$(this).css("textDecoration", (this == event.target) ? "underline" : "none"); });

		TweenMax.to(footerEl, .5, { css:{ height:360 }});
		TweenMax.to(closeFooterBtn, .5, { css:{ opacity:1 }});
		wrapEl.addClass("blurred");
	}
}

function closeFooter(event) {

	if(debugging) console.log("closeFooter");

	if(!currentItem.data("open")) carousel.freeze = false;
	TweenMax.to(footerEl, .5, { css:{ height:50 }});
	TweenMax.to(closeFooterBtn, .5, { css:{ opacity:0 }});
	wrapEl.removeClass("blurred");
	footerButtons.each(function() {	$(this).css("textDecoration", "none");	});
}
















function goHome(event) {

	if(debugging) console.log("goHome");
	//console.log(carousel.adjustedCurrent);
	// calculate closer home page?
	console.log("going home", carousel.adjustedCurrent);
	gotoItem(0);
}

function gotoItem(index) {

	if(debugging) console.log("gotoItem", index);
	var delayMove = 0;
	console.log(Math.abs(index - currentItem.data("carouselID")) > items.length/2);
	if(currentItem.data("open")) {
		closeItem(currentItem);
		delayMove = .5;
	}
	TweenMax.to(carousel, 1, { offset:((dots.length - index + 1) * carousel.spacing), ease:Power2.easeOut, delay:delayMove, onUpdate:updatePosition, onComplete:function() { currentItem = $(items[index]); if(!currentItem.hasClass("intro")) openItem(currentItem); } });
}















// ----- Animation Functions -------------------------------------------------------------------------------------------------------------------------------------------------------

function updatePosition() {	// slides dots left/right and cycles them, also scales size and opacity of item inside dot apporpriately

	if(debugging) console.log("updatePosition");

	var checkUpper = WIDTH;
	var checkLower = 0;

	for(var i = 0; i < carousel.total; i++) {

		var dot = $(dots[i]);
		var item = $(items[i]);

		// DS: this is an issue when called from resized() because dot.data("offset") is off, not sure why
		var position = carousel.offset + i * carousel.spacing + WIDTH / 6 + ((carousel.total*carousel.spacing) * dot.data("offset"));
		var size = .45;
		if(position/WIDTH > 0.15 && position/WIDTH < 0.85) size = Math.sin(((position/WIDTH)) * Math.PI);
		var opacity = size * 1.5 - .5;

		dot.css({"transform":"translateX(" + position + "px) scale(" + size + ")" });

		if(item.hasClass("intro")) { item.data("therest").css("opacity", opacity * 2 - 1);	}
		else { if(currentItem) if(!currentItem.data("open")) item.css("opacity", opacity); } 

		if(position < 0 - (carousel.spacing/2)) dot.data("offset", dot.data("offset") + 1);
		if(position > carousel.width - (carousel.spacing/2)) dot.data("offset", dot.data("offset") - 1);
		if(position < checkUpper) checkUpper = position;
		if(position > checkLower) checkLower = position;
	}

	carousel.localOffset = carousel.offset + (carousel.width * dot.data('offset'));	
	carousel.current = 1 - Math.ceil(carousel.localOffset / carousel.spacing);

	carousel.adjustedCurrent = 1 - (Math.ceil((carousel.localOffset - carousel.spacing/2) / carousel.spacing));
	if(carousel.adjustedCurrent >= dots.length) carousel.adjustedCurrent -= dots.length;

	// set current and next values
	if(carousel.current >= carousel.total) carousel.current -= carousel.total;
	carousel.next = carousel.current + 1;
	if(carousel.next >= carousel.total) carousel.next -= carousel.total;

	// fires when current changes
	if(carousel.adjustedCurrent != carousel.prevAdjustedCurrent) { 

		if(currentItem) TweenMax.to(currentItem.find(".plus"), 1, { css: { transform:"scale(0)" },  ease:Elastic.easeOut });
		currentItem = $(items[carousel.adjustedCurrent]);
		TweenMax.to(currentItem.find(".plus"), 1, { css: { transform:"scale(1)" },  ease:Elastic.easeOut });
		carousel.prevAdjustedCurrent = carousel.adjustedCurrent;

		if(toneArray.length) toneArray[Math.floor(Math.random() * toneArray.length)].play();
		// ds: change these to go from 0 to 100% and specify size in html
		if(currentItem.hasClass("intro")) {	TweenLite.to(categoryDsn, .5, { css: { width:0 } }); TweenLite.to(categoryDev, .5, { css: { width:0 } }); }
		if(currentItem.hasClass("design")) TweenLite.to(categoryDsn, .5, { css: { width:56 } });	
		if(currentItem.hasClass("dev")) TweenLite.to(categoryDev, .5, { css: { width:36 } });
	}

	carousel.morph = Math.abs((carousel.localOffset / carousel.spacing) % 1);
	updateVertices = true;

	// occasionally all the dots are offscreen, this should force them back on.
	if(checkUpper == WIDTH || checkLower == 0) debouncedResize();
}

function animate() {
	
	now = Date.now();
	time = (now-start)/speed;

	if(Math.abs(carousel.rotation) > 5) carousel.rotation *= .98;

	mesh.rotation.y += carousel.rotation/3000;

	pFlow.container.rotation.y = mesh.rotation.y;
	
	if(updateVertices) {

		for(var i = 0; i < mesh.geometry.vertices.length; i++) {

			// see if we can clean this up, might be a lot of unnecessary calculation
			mesh.geometry.vertices[i] = 
				mesh.geometry.verts[carousel.current][i].clone().add(
					mesh.geometry.verts[carousel.next][i].clone().sub(
						mesh.geometry.verts[carousel.current][i].clone()).multiplyScalar(carousel.morph));


			mesh.geometry.normals[i] = 
					mesh.geometry.norms[carousel.current][i].clone().add(
						mesh.geometry.norms[carousel.next][i].clone().sub(
							mesh.geometry.norms[carousel.current][i].clone()).multiplyScalar(carousel.morph));
	

			var vert = mesh.geometry.vertices[i].clone();
			var norm = mesh.geometry.normals[i].clone();
			var value4d = simplex.noise4D(mesh.geometry.verts[0][i].x,mesh.geometry.verts[0][i].y,mesh.geometry.verts[0][i].z,time);
			var noise = new THREE.Vector3(
				vert.x * (value4d * norm.x),
				vert.y * (value4d * norm.y),
				vert.z * (value4d * norm.z)
			).multiplyScalar(magnitude);
			mesh.geometry.vertices[i] = vert.add(noise);
		}

		modelColor = 
			modelColors[carousel.current].clone().add(
				modelColors[carousel.next].clone().sub(
					modelColors[carousel.current].clone()).multiplyScalar(carousel.morph));

		backgroundColor = 
			backgroundColors[carousel.current].clone().add(
				backgroundColors[carousel.next].clone().sub(
					backgroundColors[carousel.current].clone()).multiplyScalar(carousel.morph));

		flatMaterial.color.r = modelColor.x;
		flatMaterial.color.g = modelColor.y;
		flatMaterial.color.b = modelColor.z;

		backgroundColorRGB = new THREE.Color(backgroundColor.x,backgroundColor.y,backgroundColor.z);
		renderer.setClearColor(backgroundColorRGB);
		scene.fog.color = backgroundColorRGB;
		
		mesh.geometry.computeFaceNormals();
		mesh.geometry.computeVertexNormals();
		mesh.geometry.verticesNeedUpdate = true;
		mesh.geometry.normalsNeedUpdate = true;
	}

	


	updateParticles();

	if(webGL) postprocessing.composer.render( 0.1 );
	else renderer.render(scene, camera);
	

	requestAnimationFrame(animate);
}














function wheelMotion(event) {

	if(debugging) console.log("wheelmotion");
	if(!carousel.freeze) {
		clearTimeout(wheelTimeout);

		var delta = (event.deltaX == 0) ? event.deltaY/3 : (event.deltaX/100) * -3;

		if(!currentItem.data("open")) {
			
			TweenLite.killTweensOf(carousel);
			carousel.offset += delta;
			carousel.speed = delta/10;
			carousel.rotation += delta/10;
			updatePosition();
			wheelTimeout = setTimeout(finishTurn, 250);
		}
	}
}

function mouseMotion(event) {

	//if(debugging) console.log("mouseMotion");

	accXraw = ((event.clientX / WIDTH) - .5) * -40;
	accYraw = ((event.clientY / HEIGHT) - .5) * 60;

	accXsmooth = factor * accXsmooth + (1 - factor) * accXraw;
	accYsmooth = factor * accYsmooth + (1 - factor) * accYraw;

	camera.position.x = camOffset.x + accXsmooth;
	camera.position.y = camOffset.y + accYsmooth;
	camera.position.z = camOffset.z - ((1 - Math.cos(accYsmooth/30)) * 12);

	camera.lookAt(camTarget);
}

function deviceMotion() {
	
	if(debugging) console.log("deviceMotion",event, event.accelerationIncludingGravity.x, event.accelerationIncludingGravity.y);

	if(event.accelerationIncludingGravity.x) {
		accXraw = event.accelerationIncludingGravity.x;  
		accYraw = event.accelerationIncludingGravity.y * -1;  

		accXsmooth = factor * accXsmooth + (1 - factor) * accXraw;
		accYsmooth = factor * accYsmooth + (1 - factor) * accYraw;

		camera.position.x = camOffset.x + accXsmooth * 8;
		if(camOffset.z == 150) {
			camera.position.y = camOffset.y + (accYsmooth * 8) - 16;	
			camera.position.z = camOffset.z - (((1 - Math.cos(accYsmooth/10))) * 5);		
		}
		camera.lookAt(camTarget);
	}
}























function resized() {

	if(debugging) console.log("resized", window.innerWidth, carouselEl.width());

	WIDTH = carouselEl.width();
	WINWIDTH = window.innerWidth;
	HEIGHT = window.innerHeight;

	carouselEl.css("left", (WINWIDTH < 800) ? (WINWIDTH - 800) / 2 : 0);
	canvasEl.width(WINWIDTH);

	carousel.spacing = carouselEl.width()/3;
	carousel.width = carousel.spacing * carousel.total;

	renderer.setSize( WINWIDTH, HEIGHT );
	//postprocessing.composer.setSize( WINWIDTH, HEIGHT );

	camera.projectionMatrix.makePerspective(50, WINWIDTH / HEIGHT, camNear, camFar);

	for(var i = 0; i < items.length; i++) {

		var item = $(items[i]);
		if(item.data("carouselID") == carousel.adjustedCurrent && item.data("open")) {

			item.css({"width":WINWIDTH, "height":HEIGHT-60, "top":(HEIGHT - 60)/-2, "marginLeft":-WINWIDTH/2, "marginTop":0 });
			
			item.data("projects").each(function() { 
								
				var project = $(this);
				project.height((project.width() * 9)/16 + 30)
				project.data("imgScroller").height((project.width() * 9)/16);
				if(currentProject) if(currentProject == project) project.css("height", "100%");
			});

		}
		else {	item.css({ "marginTop":item.data("height")/-2 });	}

		if(item.find(".vimeo").length) {

			var vimeo = item.find(".vimeo");
			vimeo.height((vimeo.width() * 9)/16);
		}
	}
	
	carousel.xTarget = (carousel.total - carousel.adjustedCurrent + 1) * carousel.spacing;
	carousel.offset = carousel.xTarget;
	updatePosition();
}
var debouncedResize = debounce(resized, 250);































function hashChanged(event) {

	console.log("hashchanged");
	if(debugging) console.log("hashChanged:", hash);
	
	var URL = event.originalEvent.newURL;
	hash = URL.substring(URL.indexOf("#")+1, URL.length).toLowerCase();
	
	carouselEl.scrollLeft(0);
	wrapEl.scrollLeft(0);
	footerEl.scrollLeft(0);

	checkHash();
}

function checkHash() {
	
	if(debugging) console.log("checking hash", hash);
	if(hash == "home") goHome();
	if(hash == "about") $(footerButtons[0]).trigger("click");
	if(hash == "credits") $(footerButtons[1]).trigger("click");
	else {
		items.each(function() {
			var item = $(this);
			if(item.attr("id").toLowerCase() == hash) {
				gotoItem(item.data("carouselID"));
			}
		});
	}
}




























// Utility Functions --------------------------------------------------------------------------------------------------------------------------------------------

function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};


function webglAvailable() {
	try {
		var canvas = document.createElement( 'canvas' );
		return !!( window.WebGLRenderingContext && (
			canvas.getContext( 'webgl' ) ||
			canvas.getContext( 'experimental-webgl' ) )
		);
	} catch ( e ) {
		return false;
	}
}

(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());



var pFlow = {};

pFlow.amount = 100;
pFlow.rate = 5;
pFlow.age = 0;
pFlow.particles = [];
pFlow.container = new THREE.Object3D;
pFlow.geometry = new THREE.SphereGeometry(.5, 3, 3);
pFlow.maxAge = 300;

function addParticle() {

	var randomFace = mesh.geometry.faces[Math.floor(Math.random() * mesh.geometry.faces.length)];
	var a = mesh.geometry.vertices[randomFace.a].clone();
	var b = mesh.geometry.vertices[randomFace.b].clone();
	var c = mesh.geometry.vertices[randomFace.c].clone();
	var center = a.add(b).add(c).divideScalar(3);

	var sphere = new THREE.Mesh( pFlow.geometry, flatMaterial );
	sphere.position.x = center.x;
	sphere.position.y = center.y;
	sphere.position.z = center.z;
	sphere.rotation.x = Math.random();
	sphere.rotation.y = Math.random();
	sphere.rotation.z = Math.random();
	var size = Math.random() * 3;
	sphere.scale.set(size,size,size)

	pFlow.container.add( sphere );

	var particle = new Particle(
		sphere,
		center,
		randomFace.normal,
		Math.random() * .05 + .1,
		size,
		0,
		Math.random() * pFlow.maxAge + (pFlow.maxAge/2)
	);

	//particle.position.x += particle.direction.x * 10;
	//particle.position.y += particle.direction.y * 10;
	//particle.position.z += particle.direction.z * 10;
	pFlow.particles.push(particle);
	scene.add(pFlow.container);

}

function updateParticles() {

	if(pFlow.age % pFlow.rate == 0) addParticle();

	for(var i = 0; i < pFlow.particles.length; i++) {

		var particle = pFlow.particles[i];

		if(particle.age > particle.life) pFlow.container.remove(pFlow.particles.splice(i,1)[0].mesh);
		else {
			particle.position.x += particle.direction.x * particle.speed;
			particle.position.y += particle.direction.y * particle.speed;
			particle.position.z += particle.direction.z * particle.speed;
			particle.mesh.position.x = particle.position.x;
			particle.mesh.position.y = particle.position.y;
			particle.mesh.position.z = particle.position.z;
			var scl = particle.size * (particle.life - particle.age)/particle.life;
			particle.mesh.scale.set(scl,scl,scl);
			particle.age++;
		}
	}
	pFlow.age++;
}


function Particle(mesh, position, direction, speed, size, age, life) {

	this.mesh = mesh;
	this.position = position;
	this.direction = direction;
	this.speed = speed;
	this.size = size;
	this.age = age;
	this.life = life;
}




function resetVimeo(item) {

	var iframe = item.find(".vimeo").find("iframe");
	iframe.remove();
	item.find(".vimeo").prepend(iframe);
}

function loadImages(item) {

	item.data("projects").each(function() {

		var project = $(this);
		project.data("images").each(function() { 
			var image = $(this);
			image.attr("src",image.attr("data-original"));
		});
	});
	item.data("imagesLoaded", true);
}