(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
function Hull() {};

Hull.prototype = {

    /**
     * @property map
     * @type {L.Map|null}
     */
    map: null,

    /**
     * @method setMap
     * @param map {L.Map}
     * @return {void}
     */
    setMap: function setMap(map) {
        this.map = map;
    },

    /**
     * @link https://github.com/brian3kb/graham_scan_js
     * @method brian3kbGrahamScan
     * @param latLngs {L.LatLng[]}
     * @return {L.LatLng[]}
     */
    brian3kbGrahamScan: function brian3kbGrahamScan(latLngs) {

        var convexHull = new ConvexHullGrahamScan(),
            resolvedPoints = [],
            points = [],
            hullLatLngs = [];

        latLngs.forEach(function forEach(latLng) {

            // Resolve each latitude/longitude to its respective container point.
            points.push(this.map.latLngToLayerPoint(latLng));

        }.bind(this));

        points.forEach(function forEach(point) {
            convexHull.addPoint(point.x, point.y);
        }.bind(this));

        var hullPoints = convexHull.getHull();

        hullPoints.forEach(function forEach(hullPoint) {
            resolvedPoints.push(L.point(hullPoint.x, hullPoint.y));
        }.bind(this));

        // Create an unbroken polygon.
        resolvedPoints.push(resolvedPoints[0]);

        resolvedPoints.forEach(function forEach(point) {
            hullLatLngs.push(this.map.layerPointToLatLng(point));
        }.bind(this));

        return hullLatLngs;

    },

    /**
     * @link https://github.com/Wildhoney/ConcaveHull
     * @method wildhoneyConcaveHull
     * @param latLngs {L.LatLng[]}
     * @return {L.LatLng[]}
     */
    wildhoneyConcaveHull: function wildhoneyConcaveHull(latLngs) {
        latLngs.push(latLngs[0]);
        return new ConcaveHull(latLngs).getLatLngs();
    }

};

// define for Node module pattern loaders, including Browserify
if (typeof module === 'object' && 
    typeof module.exports === 'object') {
    module.exports = Hull;
}
},{}],2:[function(require,module,exports){
function Memory () {};

Memory.prototype = {

    /**
     * @property states
     * @type {Array}
     */
    states: [[]],

    /**
     * @property current
     * @type {Number}
     */
    current: 0,

    /**
     * @method save
     * @param polygons {Array}
     * @return {void}
     */
    save: function save(polygons) {

        this.current++;

        if (this.states[this.current]) {

            // If the current state exists then the user has started to overwrite their
            // redo history, which is expected behaviour. With that in mind, let's remove
            // the states before the current!
            this.clearFrom(this.current);

        }

        if (!this.states[this.current]) {

            // Otherwise the index is currently empty and therefore we should initialise it
            // to an empty array.
            this.states[this.current] = [];

        }

        polygons.forEach(function forEach(polygon) {

            // Each polygon is represented as a separate entry in the array.
            this.states[this.current].push(polygon._latlngs);

        }.bind(this));

    },

    /**
     * Responsible for rewinding the state and returning the current state.
     *
     * @method previous
     * @return {Array}
     */
    undo: function undo() {

        this.current--;

        if (!this.states[this.current]) {

            // Index doesn't exist in the state array.
            this.current++;

        }
        return this.states[this.current];

    },

    /**
     * @method canUndo
     * @return {Boolean}
     */
    canUndo: function canUndo() {
        return !!this.states[this.current - 1];
    },

    /**
     * Responsible for fast-forwarding the state and returning the current state.
     *
     * @method previous
     * @return {Array}
     */
    redo: function redo() {

        this.current++;

        if (!this.states[this.current]) {

            // Index doesn't exist in the state array.
            this.current--;

        }

        return this.states[this.current];

    },

    /**
     * @method canRedo
     * @return {Boolean}
     */
    canRedo: function canRedo() {
        return !!this.states[this.current + 1];
    },

    /**
     * Responsible for clearing the history from a given index, including the index supplied.
     *
     * @method clearFrom
     * @param index {Number}
     * @return {void}
     */
    clearFrom: function clearFrom(index) {
        this.states.splice(index);
    }

};

// define for Node module pattern loaders, including Browserify
if (typeof module === 'object' && 
    typeof module.exports === 'object') {
    module.exports = Memory;
}
},{}],3:[function(require,module,exports){
var Memory = require('./Memory'),
    Hull = require('./Hull'),
    touch_extend = require('./leaflet-touch-extend');

L.FreeHandShapes = L.FeatureGroup.extend({
    statics: {
        RECOUNT_TIMEOUT: 1,
        MODES: {
            NONE: 0,
            VIEW: 1,
            CREATE: 2,
            EDIT: 4,
            DELETE: 8,
            APPEND: 16,
            EDIT_APPEND: 4 | 16,
            ALL: 1 | 2 | 4 | 8 | 16
        }
    },

    options: {
        polygon: {
            className: 'leaflet-free-hand-shapes',
            smoothFactor: 5
        },
        multiplePolygons: true,
        simplifyPolygon: true,
        invalidLength: 3,
        hullAlgorithm: 'wildhoneyConcaveHull',
        boundariesAfterEdit: false,
        createExitMode: true,
        attemptMerge: true,
        iconClassName: 'polygon-elbow',
        svgClassName: 'tracer',
        polygonClassName: 'tracer',
        deleteExitMode: false,
        memoriseEachEdge: true,
        destroyPrevious: false,
        disablePropagation: false,
        elbowDistance: 10,
        onlyInDistance: false,
    },

    initialize: function(options) {

        if (typeof d3 === 'undefined') {
            // Ensure D3 has been included.
            console.error('D3 is a required library', 'http://d3js.org/');
            return;
        }

        if (typeof ClipperLib === 'undefined') {
            // Ensure JSClipper has been included.
            console.error('JSClipper is a required library', 'http://sourceforge.net/p/jsclipper/wiki/Home%206/');
            return;
        }

        L.Util.setOptions(this, options);

        // Reset all of the properties.
        this.fromPoint = { x: 0, y: 0 };
        this.polygons = [];
        this.edges = [];
        this._latLngs = [];

        this.memory = new Memory();
        this.hull = new Hull();
        this.element = options.element || null;

        this.setMode(options.mode || 1);

        this.Polygon = L.Polygon.extend({
            options: this.options.polygon
        });

    },

    onAdd: function(map) {
        var _this = this;

        this.map = map;
        this.mode = this.mode || L.FreeHandShapes.MODES.VIEW;

        // Memorise the preferences so we know how to revert.
        this.defaultPreferences = {
            dragging: map.dragging._enabled,
            touchZoom: map.touchZoom._enabled,
            doubleClickZoom: map.doubleClickZoom._enabled,
            scrollWheelZoom: map.scrollWheelZoom._enabled
        };

        if (!this.element) {

            // Define the element D3 will bind to if the user hasn't specified a custom node.
            this.element = map._container;

        }

        // Define the line function for drawing the polygon from the user's mouse pointer.
        this.lineFunction = d3.line()
            .x(function pointX(d) {
                return d.x;
            })
            .y(function pointY(d) {
                return d.y;
            });

        // Create a new instance of the D3 free-hand tracer.
        this.d3elem = d3.select(this.options.element || this.element);
        this.createD3();

        // Attach all of the events.
        this.map.on('mousedown touchstart', this.mouseDown, this);
        this.map.on('mousemove touchmove', this.mouseMove, this);
        this.map.on('mouseup touchend', this.mouseUpLeave, this);

        document.body
            .addEventListener('mouseleave', this.mouseUpLeave.bind(this));

        this.d3map = d3.select(this.map._container);

        // Set the default mode.
        this.setMode(this.mode);

    },

    onRemove: function() {

        this._clearPolygons();

        this.map.off('mousedown touchstart', this.mouseDown, this);
        this.map.off('mousemove touchmove', this.mouseMove, this);
        this.map.off('mousedown touchstart', this.mouseUpLeave, this);

        document.body
            .removeEventListener('mouseleave', this.mouseUpLeave.bind(this));

    },

    recreateEdges: function(polygon) {

        // Remove all of the current edges associated with the polygon.
        this.edges = this.edges.filter(function filter(edge) {

            if (edge._freedraw.polygon !== polygon) {
                return true;
            }

            // Physically remove the edge from the DOM.
            this.map.removeLayer(edge);

        }.bind(this));

        // We can then re-attach the edges based on the current zoom level.
        return this.createEdges(polygon);

    },

    resurrectOrphans: function() {

        var recreate = function(polygon) {

            setTimeout(function() {

                this.silently(function() {

                    // Reattach the polygon's edges.
                    this.recreateEdges(polygon);

                }.bind(this));

            }.bind(this));

        };

        var polygons = this.getPolygons(true);

        polygons.forEach(function forEach(polygon) {

            if (polygon && polygon._parts[0]) {

                // If the polygon is currently visible then we'll re-attach its edges for the current
                // zoom level.
                recreate.call(this, polygon);

            }

        }.bind(this));

        setTimeout(function setTimeout() {

            // Notify everybody of the update if we're using the edges to read the lat/longs.
            this.notifyBoundaries();

        }.bind(this));

    },

    silently: function(callbackFn) {

        var silentBefore = this.silenced;
        this.silenced = true;
        callbackFn.apply(this);

        if (!silentBefore) {

            // Only remove the silence if it wasn't silent before, which prevents against
            // nesting the `silently` methods inside one another.
            this.silenced = false;

        }

    },

    cancelAction: function() {

        this.creating = false;
        this.movingEdge = null;

        // Begin to create a brand-new polygon.
        this.destroyD3().createD3();

    },

    setMapPermissions: function(method) {

        this.map.dragging[method]();
        this.map.touchZoom[method]();
        this.map.doubleClickZoom[method]();
        this.map.scrollWheelZoom[method]();

        if (method === 'enable') {

            // Inherit the preferences assigned to the map instance by the developer.

            if (!this.defaultPreferences.dragging) {
                this.map.dragging.disable();
            }

            if (!this.defaultPreferences.touchZoom) {
                this.map.touchZoom.disable();
            }

            if (!this.defaultPreferences.doubleClickZoom) {
                this.map.doubleClickZoom.disable();
            }

            if (!this.defaultPreferences.scrollWheelZoom) {
                this.map.scrollWheelZoom.disable();
            }

        }

    },

    setMode: function(mode) {

        // Prevent the mode from ever being defined as zero.
        mode = mode || L.FreeHandShapes.MODES.VIEW;

        // Set the current mode and emit the event.
        this.mode = mode;
        this.fire('mode', {
            mode: mode
        });

        if (!this.map) {
            return;
        }

        // Enable or disable dragging according to the current mode.
        var isCreate = !!(mode & L.FreeHandShapes.MODES.CREATE),
            method = !isCreate ? 'enable' : 'disable';
        this.map.dragging[method]();

        if (this.boundaryUpdateRequired && !(this.mode & L.FreeHandShapes.MODES.EDIT)) {

            // Share the boundaries if there's an update available and the user is changing the mode
            // to anything else but the edit mode again.
            this.notifyBoundaries();
            this.boundaryUpdateRequired = false;

            if (!this.options.memoriseEachEdge) {
                this.memory.save(this.getPolygons(true));
            }

        }

        /**
         * Responsible for applying the necessary classes to the map based on the
         * current active modes.
         *
         * @method defineClasses
         * @return {void}
         */
        (function defineClasses(modes, map, addClass, removeClass) {

            removeClass(map, 'mode-create');
            removeClass(map, 'mode-edit');
            removeClass(map, 'mode-delete');
            removeClass(map, 'mode-view');
            removeClass(map, 'mode-append');

            if (mode & modes.CREATE) {
                addClass(map, 'mode-create');
            }

            if (mode & modes.EDIT) {
                addClass(map, 'mode-edit');
            }

            if (mode & modes.DELETE) {
                addClass(map, 'mode-delete');
            }

            if (mode & modes.VIEW) {
                addClass(map, 'mode-view');
            }

            if (mode & modes.APPEND) {
                addClass(map, 'mode-append');
            }

        }(L.FreeHandShapes.MODES, this.map._container, L.DomUtil.addClass, L.DomUtil.removeClass));

    },

    unsetMode: function(mode) {
        this.setMode(this.mode ^ mode);
    },

    createD3: function() {

        this.svg = this.d3elem
            .append('svg')
            .attr('class', this.options.svgClassName)
            .attr('width', 200).attr('height', 200);

    },

    destroyD3: function() {
        this.svg.remove();
        this.svg = {};
        return this;
    },

    latLngsToClipperPoints: function(latLngs) {

        return latLngs.map(function(latLng) {

            var point = this.map.latLngToLayerPoint(latLng);
            return {
                X: point.x,
                Y: point.y
            };

        }.bind(this));

    },

    clipperPolygonsToLatLngs: function(polygons) {

        var latLngs = [];

        polygons.forEach(function(polygon) {

            polygon.forEach(function(point) {

                point = L.point(point.X, point.Y);
                var latLng = this.map.layerPointToLatLng(point);
                latLngs.push(latLng);

            }.bind(this));

        }.bind(this));

        return latLngs;

    },

    uniqueLatLngs: function(latLngs) {

        var previousLatLngs = [],
            uniqueValues = [];

        latLngs.forEach(function(latLng) {

            var model = JSON.stringify(latLng);

            if (previousLatLngs.indexOf(model) !== -1) {
                return;
            }

            previousLatLngs.push(model);
            uniqueValues.push(latLng);

        });

        return uniqueValues;

    },

    handlePolygonClick: function(polygon, event) {

        var latLngs = [],
            newPoint = this.map.mouseEventToContainerPoint(event.originalEvent),
            lowestDistance = Infinity,
            startPoint = new L.Point(),
            endPoint = new L.Point(),
            parts = [];

        polygon._latlngs.forEach(function(latLng) {

            // Push each part into the array, because relying on the polygon's "_parts" array
            // isn't safe since they are removed when parts of the polygon aren't visible.
            parts.push(this.map.latLngToContainerPoint(latLng));

        }.bind(this));

        parts.forEach(function forEach(point, index) {

            var firstPoint = point,
                secondPoint = parts[index + 1] || parts[0],
                distance = L.LineUtil.pointToSegmentDistance(newPoint, firstPoint, secondPoint);

            if (distance < lowestDistance) {

                // We discovered a distance that possibly should contain the new point!
                lowestDistance = distance;
                startPoint = firstPoint;
                endPoint = secondPoint;

            }

        }.bind(this));

        parts.forEach(function forEach(point, index) {

            var nextPoint = parts[index + 1] || parts[0];

            if (point === startPoint && nextPoint === endPoint) {

                latLngs.push(this.map.containerPointToLatLng(point));
                latLngs.push(this.map.containerPointToLatLng(newPoint));
                return;

            }

            latLngs.push(this.map.containerPointToLatLng(point));

        }.bind(this));

        /**
         * @constant INNER_DISTANCE
         * @type {Number}
         */
        var INNER_DISTANCE = this.options.elbowDistance;

        /**
         * @method updatePolygon
         * @return {void}
         */
        var updatePolygon = function updatePolygon() {

            if (!(this.mode & L.FreeHandShapes.MODES.APPEND)) {

                // User hasn't enabled the append mode.
                return;

            }

            // Redraw the polygon based on the newly added lat/long boundaries.
            polygon.setLatLngs(latLngs);

            // Recreate the edges for the polygon.
            this.destroyEdges(polygon);
            this.createEdges(polygon);

        }.bind(this);

        // If the user hasn't enabled delete mode but has the append mode active, then we'll
        // assume they're always wanting to add an edge.
        if (this.mode & L.FreeHandShapes.MODES.APPEND && !(this.mode & L.FreeHandShapes.MODES.DELETE)) {

            // Mode has been set to only add new elbows when the user clicks the polygon close
            // to the boundaries as defined by the `setMaximumDistanceForElbow` method.
            if (this.options.onlyInDistance && lowestDistance > INNER_DISTANCE) {
                return;
            }

            updatePolygon();
            return;

        }

        // If the inverse of the aforementioned is true then we'll always delete the polygon.
        if (this.mode & L.FreeHandShapes.MODES.DELETE && !(this.mode & L.FreeHandShapes.MODES.APPEND)) {
            this.destroyPolygon(polygon);
            return;
        }

        // Otherwise we'll use some logic to detect whether we should delete or add a new elbow.
        if (lowestDistance > INNER_DISTANCE && this.mode & L.FreeHandShapes.MODES.DELETE) {

            // Delete the polygon!
            this.destroyPolygon(polygon);
            return;

        }

        // Otherwise create a new elbow.
        updatePolygon();

    },

    createPolygon: function(latLngs, forceCreation) {

        if (!this.options.multiplePolygons && this.getPolygons(true).length >= 1) {

            if (this.options.destroyPrevious) {

                // Destroy the current polygon and then draw the current polygon.
                this.silently(this.clearPolygons);

            } else {

                // Otherwise delete the line because polygon creation has been disallowed, since there's
                // already one polygon on the map.
                this.destroyD3().createD3();
                return false;

            }

        }

        // Begin to create a brand-new polygon.
        this.destroyD3().createD3();

        if (this.options.simplifyPolygon) {

            latLngs = function simplifyPolygons() {

                var points = ClipperLib.Clipper.CleanPolygon(this.latLngsToClipperPoints(latLngs), 1.1),
                    polygons = ClipperLib.Clipper.SimplifyPolygon(points, ClipperLib.PolyFillType.pftNonZero);

                return this.clipperPolygonsToLatLngs(polygons);

            }.apply(this);

        }

        if (latLngs.length <= this.options.invalidLength) {

            if (!forceCreation) {
                return false;
            }

        }

        var polygon = new this.Polygon(latLngs, this.options.polygon);

        // Handle the click event on a polygon.
        polygon.on('click', function(event) {
            this.handlePolygonClick(polygon, event);
        }, this);

        // Add the polyline to the map, and then find the edges of the polygon.
        polygon.addTo(this.map);

        /*
        TODO:
        `this` is a feature group, it should call this.addLayer(polygon)
        */
        this.polygons.push(polygon);

        // Attach all of the edges to the polygon.
        this.createEdges(polygon);

        /**
         * Responsible for preventing the re-rendering of the polygon.
         *
         * @method clobberLatLngs
         * @return {void}
         */
        (function clobberLatLngs() {

            if (this.silenced || !polygon._parts[0]) {
                return;
            }

            polygon._latlngs = [];

            polygon._parts[0].forEach(function(edge) {

                // Iterate over all of the parts to update the latLngs to clobber the redrawing upon zooming.
                polygon._latlngs.push(this.map.layerPointToLatLng(edge));

            }.bind(this));

        }.bind(this))();

        if (this.options.attemptMerge && !this.silenced) {

            // Merge the polygons if the developer wants to, which at the moment is very experimental!
            this.mergePolygons();

        }

        if (!this.silenced) {
            this.notifyBoundaries();
            this.memory.save(this.getPolygons(true));
        }

        return polygon;

    },

    predefinedPolygon: function(latLngs) {
        return this.createPolygon(latLngs, true);
    },

    undo: function() {
        this._modifyState('undo');
    },

    redo: function redo() {
        this._modifyState('redo');
    },

    _modifyState: function _modifyState(method) {

        // Silently remove all of the polygons, and then obtain the new polygons to be inserted
        // into the Leaflet map.
        this.silently(this._clearPolygons.bind(this));

        var polygons = this.memory[method]();

        // Iteratively create each polygon for the new state.
        polygons.forEach(function(polygon) {

            this.silently(function() {

                // Create each of the polygons from the current state silently.
                this.createPolygon(polygon);

            }.bind(this));

        }.bind(this));

        // ...And we can finally notify everybody of our new boundaries!
        this.notifyBoundaries();

    },

    getPolygons: function(includingOrphans) {

        var polygons = [];

        if (includingOrphans) {

            if (!this.map) {
                return [];
            }

            /**
             * Used to identify a node that is a <g> element.
             *
             * @constant GROUP_TAG
             * @type {String}
             */
            var GROUP_TAG = 'G';

            for (var layerIndex in this.map._layers) {

                if (this.map._layers.hasOwnProperty(layerIndex)) {

                    var polygon = this.map._layers[layerIndex];

                    // Ensure we're dealing with a <g> node that was created by FreeDraw (...an SVG group element).
                    if (polygon._container && polygon._container.tagName.toUpperCase() === GROUP_TAG) {
                        if (polygon instanceof this.Polygon) {
                            polygons.push(polygon);
                        }
                    }

                }

            }

        } else {

            this.edges.forEach(function(edge) {

                if (polygons.indexOf(edge._freedraw.polygon) === -1) {
                    if (edge._freedraw.polygon instanceof this.Polygon) {
                        polygons.push(edge._freedraw.polygon);
                    }
                }

            }.bind(this));

        }

        return polygons;

    },

    mergePolygons: function() {

        /**
         * @method mergePass
         * @return {void}
         */
        var mergePass = function() {

            var allPolygons = this.getPolygons(),
                allPoints = [];

            allPolygons.forEach(function(polygon) {
                allPoints.push(this.latLngsToClipperPoints(polygon._latlngs));
            }.bind(this));

            var polygons = ClipperLib.Clipper.SimplifyPolygons(allPoints, ClipperLib.PolyFillType.pftNonZero);

            this.silently(function() {

                this._clearPolygons();

                polygons.forEach(function(polygon) {

                    var latLngs = [];

                    polygon.forEach(function(point) {

                        point = L.point(point.X, point.Y);
                        latLngs.push(this.map.layerPointToLatLng(point));

                    }.bind(this));

                    // Create the polygon!
                    this.createPolygon(latLngs, true);

                }.bind(this));

            });

        }.bind(this);

        // Perform two merge passes to simplify the polygons.
        mergePass();
        mergePass();

        // Trim polygon edges after being modified.
        this.getPolygons(true).forEach(this.trimPolygonEdges.bind(this));

    },

    destroyPolygon: function(polygon) {

        this.map.removeLayer(polygon);

        // Remove from the polygons array.
        var index = this.polygons.indexOf(polygon);
        this.polygons.splice(index, 1);

        this.destroyEdges(polygon);

        if (!this.silenced) {
            this.notifyBoundaries();
            this.memory.save(this.getPolygons(true));
        }

        if (this.options.deleteExitMode && !this.silenced) {

            // Automatically exit the user from the deletion mode.
            this.setMode(this.mode ^ L.FreeHandShapes.MODES.DELETE);

        }

    },

    destroyEdges: function(polygon) {

        // ...And then remove all of its related edges to prevent memory leaks.
        this.edges = this.edges.filter(function filter(edge) {

            if (edge._freedraw.polygon !== polygon) {
                return true;
            }

            // Physically remove the edge from the DOM.
            this.map.removeLayer(edge);

        }.bind(this));

    },

    clearPolygons: function() {

        this.silently(this._clearPolygons);

        if (!this.silenced) {
            this.notifyBoundaries();
            this.memory.save(this.getPolygons(true));
        }

    },

    _clearPolygons: function() {

        this.getPolygons().forEach(function(polygon) {

            // Iteratively remove each polygon in the DOM.
            this.destroyPolygon(polygon);

        }.bind(this));

        if (!this.silenced) {
            this.notifyBoundaries();
        }

    },

    notifyBoundaries: function() {

        var latLngs = [];

        this.getPolygons(true).forEach(function(polygon) {

            // Ensure the polygon is visible.
            latLngs.push(polygon._latlngs);

        }.bind(this));

        // Ensure the polygon is closed for the geospatial query.
        (function createClosedPolygon() {

            latLngs.forEach(function forEach(latLngGroup) {

                // Determine if the latitude/longitude values differ for the first and last
                // lat/long objects.
                var lastIndex = latLngGroup.length - 1;

                if (lastIndex && latLngGroup[0] && latLngGroup[lastIndex]) {

                    var latDiffers = latLngGroup[0].lat !== latLngGroup[lastIndex].lat,
                        lngDiffers = latLngGroup[0].lng !== latLngGroup[lastIndex].lng;

                    if (latDiffers || lngDiffers) {

                        // It's not currently a closed polygon for the query, so we'll create the closed
                        // polygon for the geospatial query.
                        latLngGroup.push(latLngGroup[0]);

                    }

                }

            });

        }.bind(this))();

        // Update the polygon count variable.
        this.polygonCount = latLngs.length;

        // Ensure the last shared notification differs from the current.
        var notificationFingerprint = JSON.stringify(latLngs);
        if (this.lastNotification === notificationFingerprint) {
            return;
        }

        // Save the notification for the next time.
        this.lastNotification = notificationFingerprint;

        // Invoke the user passed method for specifying latitude/longitudes.
        this.fire('markers', {
            latLngs: latLngs
        });

        // Perform another count at a later date to account for polygons that may have been removed
        // due to their polygon areas being too small.
        setTimeout(this.emitPolygonCount.bind(this), L.FreeHandShapes.RECOUNT_TIMEOUT);

    },

    emitPolygonCount: function() {

        /**
         * @constant EMPTY_PATH
         * @type {String}
         */
        var EMPTY_PATH = 'M0 0',
            polygons,
            allEmpty;

        if (window.L_PREFER_CANVAS) {
            polygons = this.polygons || [];
        } else {
            // Perform a recount on the polygon count, since some may be removed because of their
            // areas being too small.
            polygons = this.getPolygons(true);
            allEmpty = polygons.every(function (polygon) {

                var path = polygon._container.lastChild.getAttribute('d').trim();
                return path === EMPTY_PATH;

            });
        }

        if (allEmpty) {

            this.silently(function() {

                // Silently remove all of the polygons because they are empty.
                this._clearPolygons();
                this.fire('markers', {
                    latLngs: []
                });
                this.fire('count', {
                    count: this.polygonCount
                });

            }.bind(this));

            this.polygonCount = 0;
            polygons.length = 0;

        }

        if (polygons.length !== this.polygonCount) {

            // If the size differs then we'll assign the new length, and emit the count event.
            this.polygonCount = polygons.length;
            this.fire('count', {
                count: this.polygonCount
            });

        }

    },

    createEdges: function(polygon) {

        /**
         * Responsible for getting the parts based on the original lat/longs.
         *
         * @method originalLatLngs
         * @param polygon {Object}
         * @return {Array}
         */
        var originalLatLngs = function(polygon) {

            if (!polygon._parts[0]) {

                // We don't care for polygons that are not in the viewport.
                return [];

            }

            return polygon._latlngs.map(function(latLng) {
                return this.map.latLngToLayerPoint(latLng);
            }.bind(this));

        }.bind(this);

        var parts = this.uniqueLatLngs(originalLatLngs(polygon)),
            indexOf = this.polygons.indexOf(polygon),
            edgeCount = 0;

        if (!parts) {
            return false;
        }

        parts.forEach(function(point) {

            // Leaflet creates elbows in the polygon, which we need to utilise to add the
            // points for modifying its shape.
            var edge = new L.DivIcon({
                    className: Array.isArray(this.options.iconClassName) ? this.options.iconClassName[indexOf] : this.options.iconClassName
                }),
                latLng = this.map.layerPointToLatLng(point);

            edge = L.marker(latLng, {
                icon: edge
            }).addTo(this.map);

            // Setup the freedraw object with the meta data.
            edge._freedraw = {
                polygon: polygon,
                polygonId: polygon['_leaflet_id'],
                latLng: edge._latlng
            };

            this.edges.push(edge);
            edgeCount++;

            edge.on('mousedown touchstart', function(event) {

                event.originalEvent.preventDefault();
                event.originalEvent.stopPropagation();
                this.movingEdge = event.target;

            }.bind(this));

        }.bind(this));

        return edgeCount;

    },

    updatePolygonEdge: function(edge, positionX, positionY) {

        var updatedLatLng = this.map.containerPointToLatLng(new L.Point(positionX, positionY));

        // Update the latitude and longitude for both the Leaflet.js model, and the FreeDraw model.
        edge.setLatLng(updatedLatLng);
        edge._freedraw.latLng = updatedLatLng;

        var allEdges = [];

        // Fetch all of the edges in the group based on the polygon.
        var edges = this.edges.filter(function(currentEdge) {
            allEdges.push(currentEdge);
            return currentEdge._freedraw.polygon === edge._freedraw.polygon;
        });

        // Update the edge object.
        this.edges = allEdges;

        var updatedLatLngs = [];
        edges.forEach(function(marker) {
            updatedLatLngs.push(marker.getLatLng());
        });

        // Update the latitude and longitude values.
        edge._freedraw.polygon.setLatLngs(updatedLatLngs);
        edge._freedraw.polygon.redraw();

    },

    mouseDown: function(event) {
        if (this.creating) {
            return;
        }

        /**
         * Used for determining if the user clicked with the right mouse button.
         *
         * @constant RIGHT_CLICK
         * @type {Number}
         */
        var RIGHT_CLICK = 2;

        if (event.originalEvent.button === RIGHT_CLICK) {
            return;
        }

        var originalEvent = event.originalEvent;

        if (!this.options.disablePropagation) {
            originalEvent.stopPropagation();
        }

        originalEvent.preventDefault();

        this.latLngs = [];
        this.fromPoint = this.map.latLngToContainerPoint(event.latlng);

        if (this.mode & L.FreeHandShapes.MODES.CREATE) {

            // Place the user in create polygon mode.
            this.creating = true;
            this.setMapPermissions('disable');

        }

    },

    mouseMove: function(event) {
        if (this.movingEdge) {

            // User is in fact modifying the shape of the polygon.
            this._editMouseMove(event);
            return;

        }

        if (!this.creating) {

            // We can't do anything else if the user is not in the process of creating a brand-new
            // polygon.
            return;

        }

        var latlng = event.latlng,
            point = this.map.latLngToContainerPoint(latlng),
            lineData = [this.fromPoint, point];

        // Draw SVG line based on the last movement of the mouse's position.
        this.svg.append('path').classed('drawing-line', true).attr('d', this.lineFunction(lineData))
            .attr('stroke', '#D7217E').attr('stroke-width', 2).attr('fill', 'none');

        this.fromPoint = point;
        this.latLngs.push(latlng);

    },

    mouseUpLeave: function() {

        if (this.movingEdge) {

            if (!this.options.boundariesAfterEdit) {

                // Notify of a boundary update immediately after editing one edge.
                this.notifyBoundaries();

            } else {

                // Change the option so that the boundaries will be invoked once the edit mode
                // has been exited.
                this.boundaryUpdateRequired = true;

            }

            // Recreate the polygon boundaries because we may have straight edges now.
            this.trimPolygonEdges(this.movingEdge._freedraw.polygon);
            this.mergePolygons();
            this.movingEdge = null;

            if (this.options.memoriseEachEdge) {
                this.memory.save(this.getPolygons(true));
            }

            setTimeout(this.emitPolygonCount.bind(this), L.FreeHandShapes.RECOUNT_TIMEOUT);
            return;

        }

        this._createMouseUp();

    },

    _editMouseMove: function(event) {

        var pointModel = this.map.latLngToContainerPoint(event.latlng);

        // Modify the position of the marker on the map based on the user's mouse position.
        var styleDeclaration = this.movingEdge._icon.style;
        styleDeclaration[L.DomUtil.TRANSFORM] = pointModel;

        // Update the polygon's shape in real-time as the user drags their cursor.
        this.updatePolygonEdge(this.movingEdge, pointModel.x, pointModel.y);

    },

    touchStart: function(point) {
        if (this.creating) {
            return;
        }

        if (!this.options.disablePropagation) {
            d3.event.stopPropagation();
        }

        d3.event.preventDefault();

        this.latLngs = [];
        this.fromPoint = L.point(point);

        if (this.mode & L.FreeHandShapes.MODES.CREATE) {

            // Place the user in create polygon mode.
            this.creating = true;
            this.setMapPermissions('disable');

        }
    },

    touchMove: function(point) {
        if (this.movingEdge) {

            // User is in fact modifying the shape of the polygon.
            this._editMouseMove(event);
            return;

        }

        if (!this.creating) {

            // We can't do anything else if the user is not in the process of creating a brand-new
            // polygon.
            return;

        }

        var newpoint = L.point(point),
            latLng = this.map.containerPointToLatLng(newpoint),
            lineData = [this.fromPoint, newpoint];

        // Draw SVG line based on the last movement of the mouse's position.
        this.svg.append('path').classed('drawing-line', true).attr('d', this.lineFunction(lineData))
            .attr('stroke', '#D7217E').attr('stroke-width', 2).attr('fill', 'none');

        // Take the pointer's position from the event for the next invocation of the mouse move event,
        // and store the resolved latitudinal and longitudinal values.
        this.fromPoint = newpoint;
        this.latLngs.push(latLng);
    },

    trimPolygonEdges: function(polygon) {

        var latLngs = [];

        if (!polygon || polygon._parts.length === 0 || !polygon._parts[0]) {
            return;
        }

        polygon._parts[0].forEach(function forEach(point) {
            latLngs.push(this.map.layerPointToLatLng(point));
        }.bind(this));

        polygon.setLatLngs(latLngs);
        polygon.redraw();

        this.destroyEdges(polygon);
        this.createEdges(polygon);

    },

    _createMouseUp: function() {

        if (!this.creating) {
            return;
        }

        // User has finished creating their polygon!
        this.creating = false;

        if (this.latLngs.length <= 2) {

            // User has failed to drag their cursor enough to create a valid polygon.
            return;

        }

        if (this.options.hullAlgorithm) {

            // Use the defined hull algorithm.
            this.hull.setMap(this.map);
            var latLngs = this.hull[this.options.hullAlgorithm](this.latLngs);

        }

        // Required for joining the two ends of the free-hand drawing to create a closed polygon.
        this.latLngs.push(this.latLngs[0]);

        // Physically draw the Leaflet generated polygon.
        var polygon = this.createPolygon(latLngs || this.latLngs);

        if (!polygon) {
            this.setMapPermissions('enable');
            return;
        }

        this.latLngs = [];

        if (this.options.createExitMode) {

            // Automatically exit the user from the creation mode.
            this.setMode(this.mode ^ L.FreeHandShapes.MODES.CREATE);

        }
        // moved outside condition to try to fix locked zoom after poly creation
        this.setMapPermissions('enable');

    }

});

},{"./Hull":1,"./Memory":2,"./leaflet-touch-extend":4}],4:[function(require,module,exports){
L.Map.mergeOptions({
  touchExtend: true
});

L.Map.TouchExtend = L.Handler.extend({

  initialize: function (map) {
    this._map = map;
    this._container = map._container;
    this._pane = map._panes.overlayPane;
  },

  addHooks: function () {
    L.DomEvent.on(this._container, 'touchstart', this._onTouchStart, this);
    L.DomEvent.on(this._container, 'touchmove', this._onTouchMove, this);
    L.DomEvent.on(this._container, 'touchend', this._onTouchEnd, this);
  },

  removeHooks: function () {
    L.DomEvent.off(this._container, 'touchstart', this._onTouchStart);
    L.DomEvent.on(this._container, 'touchmove', this._onTouchMove, this);
    L.DomEvent.off(this._container, 'touchend', this._onTouchEnd);
  },

  _onTouchStart: function (e) {
    if (!this._map._loaded) { return; }

    var type = 'touchstart',
        touch = e.touches[0],
        rect = this._container.getBoundingClientRect(),
        x = touch.clientX - rect.left - this._container.clientLeft,
        y = touch.clientY - rect.top - this._container.clientTop,
        containerPoint = L.point(x, y),
        layerPoint = this._map.containerPointToLayerPoint(containerPoint);
        latlng = this._map.containerPointToLatLng(containerPoint);

    this._map.fire(type, {
      latlng: latlng,
      layerPoint: layerPoint,
      containerPoint : containerPoint,
      originalEvent: e
    });
  },

  _onTouchMove: function (e) {
    if (!this._map._loaded || !e.changedTouches.length) { 
        return; 
    }

    var type = 'touchmove',
        touch = e.changedTouches[0],
        rect = this._container.getBoundingClientRect(),
        x = touch.clientX - rect.left - this._container.clientLeft,
        y = touch.clientY - rect.top - this._container.clientTop,
        containerPoint = L.point(x, y),
        layerPoint = this._map.containerPointToLayerPoint(containerPoint);
        latlng = this._map.containerPointToLatLng(containerPoint);

    this._map.fire(type, {
      latlng: latlng,
      layerPoint: layerPoint,
      containerPoint : containerPoint,
      originalEvent: e
    });
  },

  _onTouchEnd: function (e) {
    if (!this._map._loaded) { return; }

    var type = 'touchend';

    this._map.fire(type, {
      originalEvent: e
    });
  }
});
L.Map.addInitHook('addHandler', 'touchExtend', L.Map.TouchExtend);
},{}]},{},[3]);
