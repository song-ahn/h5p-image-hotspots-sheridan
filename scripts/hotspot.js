/**
 * Defines the ImageHotspots.Hotspot class
 */
//@@SONG: changed classname
(function ($, ImageHotspotsSheridan) {

  /**
   * Creates a new Hotspot
   *
   * @class
   * @namespace H5P.ImageHotspots
   * @param  {Object} config
   * @param  {Object} options
   * @param  {number} id
   * @param  {boolean} isSmallDeviceCB
   * @param  {H5P.ImageHotspots} parent
   */
  ImageHotspotsSheridan.Hotspot = function (config, options, id, isSmallDeviceCB, parent) {
    var self = this;
    this.config = config;
    this.visible = false;
    this.id = id;
    this.isSmallDeviceCB = isSmallDeviceCB;
    this.options = options;
    this.parent = parent;

    // A utility variable to check if a Predefined icon or an uploaded image should be used.
    var iconImageExists = (options.iconImage !== undefined && options.iconType === 'image');

    if (this.config.content === undefined  || this.config.content.length === 0) {
      throw new Error('Missing content configuration for hotspot. Please fix in editor.');
    }

    // Check if there is an iconImage that should be used instead of fontawesome icons to determine the html element.
    this.$element = $(iconImageExists ? '<img/>' : '<button/>', {
      'class': 'h5p-image-hotspot ' + 
        (!iconImageExists ? 'h5p-image-hotspot-' + options.icon : '') +
        (config.position.legacyPositioning ? ' legacy-positioning' : ''),  
      'role': 'button',
      'tabindex': 0,
      'aria-haspopup': true,
      src: iconImageExists ? H5P.getPath(options.iconImage.path, this.id) : undefined,
      click: function () {
        // prevents duplicates while loading
        if (self.loadingPopup) {
          return false;
        }

        if (self.visible) {
          self.hidePopup();
        }
        else {
          self.showPopup(true);
        }
        return false;
      },
      keydown: function (e) {
        if (e.which === 32 || e.which === 13) {
          // Prevent duplicates while loading
          if (self.loadingPopup) {
            return false;
          }

          if (self.visible) {
            self.hidePopup();
          }
          else {
            self.showPopup(true);
          }
          e.stopPropagation();
          return false;
        }
      }
    });
    
    this.$element.css({
      top: this.config.position.y + '%',
      left: this.config.position.x + '%',
      color: options.color,
      backgroundColor: options.backgroundColor ? options.backgroundColor : ''
    });

    parent.on('resize', function () {
      if (self.popup) {

        self.actionInstances.forEach(function (actionInstance) {
          if (actionInstance.trigger !== undefined) {

            // The reason for this timeout is fullscreen on chrome on android
            setTimeout(function () {
              actionInstance.trigger('resize');
            }, 1);
          }
        });
      }
    });
  };

  /**
   * Append the hotspot to a container
   * @public
   * @param {H5P.jQuery} $container
   */
  ImageHotspotsSheridan.Hotspot.prototype.appendTo = function ($container) {
    this.$container = $container;
    this.$element.appendTo($container);
  };

  /**
   * Display the popup
   * @param {boolean} [focusPopup] Focuses popup for keyboard accessibility
   */
  ImageHotspotsSheridan.Hotspot.prototype.showPopup = function (focusPopup) {
    var self = this;

    // Create popup content:
    var $popupBody = $('<div/>', {'class': 'h5p-image-hotspot-popup-body'});
    self.loadingPopup = true;

    this.parent.setShowingPopup(true);

    this.actionInstances = [];
    var waitForLoaded = [];
    this.config.content.forEach(function (action) {
      var $popupFraction = $('<div>', {
        'class': 'h5p-image-hotspot-popup-body-fraction',
        appendTo: $popupBody
      });

      // Enforce autoplay for transparent audios
      if (action.library.split(' ')[0] === 'H5P.Audio') {
        if (action.params.playerMode === 'transparent') {
          action.params.autoplay = true;
        }
      }

      var actionInstance = H5P.newRunnable(action, self.id);

      self.actionInstances.push(actionInstance);
      if (actionInstance.libraryInfo.machineName === 'H5P.Image' || actionInstance.libraryInfo.machineName === 'H5P.Video') {
        waitForLoaded.push(actionInstance);
      }
      actionInstance.attach($popupFraction);

      if (actionInstance.libraryInfo.machineName === 'H5P.Audio') {
        if (actionInstance.audio && actionInstance.params.playerMode === 'full' && !!window.chrome) {
          // Workaround for missing https://github.com/h5p/h5p-audio/pull/48
          actionInstance.audio.style.height = '54px';
        }
        else if (actionInstance.$audioButton && actionInstance.params.playerMode === 'transparent') {
          // Completely hide transparent button
          actionInstance.$audioButton.css({ height: 0, padding: 0 });
        }
      }

      // Stop screenreader to read fullscreen button
      if (self.parent.fullscreenButton) {
        self.parent.fullscreenButton.tabIndex = -1;
      }
    });

    var readyToPopup = function () {
      // Disable all hotspots
      self.toggleHotspotsTabindex(true);
      self.visible = true;
      self.popup.show(focusPopup);
      self.$element.addClass('active');
      self.actionInstances.forEach(function (actionInstance) {
        actionInstance.trigger('resize');
      });
    };

    // Popup style
    var popupClass = 'h5p-video';
    if (!waitForLoaded.length) {
      popupClass = 'h5p-text';
    }
    else if (self.actionInstances.length === 1 && self.actionInstances[0].libraryInfo.machineName === 'H5P.Image') {
      popupClass = 'h5p-image';
    }

    // Create Image hot-spots popup
    self.popup = new ImageHotspotsSheridan.Popup(
      self.$container, $popupBody,
      self.config.position.x,
      self.config.position.y,
      self.$element.outerWidth(),
      self.config.header,
      popupClass,
      self.config.alwaysFullscreen || self.isSmallDeviceCB(),
      self.options,
      self.config.position.legacyPositioning
    );

    self.parent.on('resize', function () {
      if (self.visible) {
        self.popup.resize();
      }
    });

    // Release
    self.popup.on('closed', function (e) {
      self.hidePopup();

      // Refocus hotspot
      if (e.data && e.data.refocus) {
        self.focus();
      }
    });

    // Finished loading popup
    self.popup.on('finishedLoading', function () {
      self.loadingPopup = false;
    });

    if (waitForLoaded.length) {
      var loaded = 0;

      // Wait for libraries to load before showing popup
      waitForLoaded.forEach(function (unloaded) {

        // Signal that library has finished loading
        var fire = function () {
          clearTimeout(timeout);
          unloaded.off('loaded', fire);
          loaded += 1;

          if (loaded >= waitForLoaded.length) {
            setTimeout(function () {
              readyToPopup();
            }, 100);
          }
        };

        // Add timer fallback if loaded event is not triggered
        var timeout = setTimeout(fire, 1000);
        unloaded.on('loaded', fire, {unloaded: unloaded, timeout: timeout});
        unloaded.trigger('resize');
      });

    }
    else {
      setTimeout(function () {
        readyToPopup();
      }, 100);
    }

    // We don't get click events on body for iOS-devices
    $('body').children().on('click.h5p-image-hotspot-popup', function (event) {
      var $target = $(event.target);
      if (self.visible && !$target.hasClass('h5p-enable-fullscreen') && !$target.hasClass('h5p-disable-fullscreen')) {
        self.hidePopup();
      }
    });
  };

  /**
   * Toggle whether hotspots has tabindex
   * @param {boolean} [disable] Disable tabindex if true
   */
  ImageHotspotsSheridan.Hotspot.prototype.toggleHotspotsTabindex = function (disable) {
    this.$container.find('.h5p-image-hotspot')
      .attr('tabindex', disable ? '-1' : '0')
      .attr('aria-hidden', disable ? true : '');
  };

  /**
   * Hide popup
   * @public
   */
  ImageHotspotsSheridan.Hotspot.prototype.hidePopup = function () {
    if (this.popup) {
      // We don't get click events on body for iOS-devices
      $('body').children().off('click.h5p-image-hotspot-popup');

      this.pause();
      this.popup.hide();
      this.$element.removeClass('active');
      this.visible = false;
      this.popup = undefined;
      this.toggleHotspotsTabindex();
    }

    this.parent.setShowingPopup(false);

    // Make fullscreen button focusable again
    if (this.parent.fullscreenButton) {
      this.parent.fullscreenButton.tabIndex = 0;
    }
  };

  /**
   * Focus hotspot
   */
  ImageHotspotsSheridan.Hotspot.prototype.focus = function () {
    this.$element.focus();
  };

  /**
   * Set up trapping of focus
   *
   * @param {ImageHotspots.Hotspot} hotspot Hotspot that focus should be trapped to
   * @param {boolean} [trapReverseTab] Traps when tabbing backwards
   */
  ImageHotspotsSheridan.Hotspot.prototype.setTrapFocusTo = function (hotspot, trapReverseTab) {
    this.$element.on('keydown.trapfocus', function (e) {
      var keyCombination = e.which === 9 && (trapReverseTab ? e.shiftKey : !e.shiftKey);
      if (keyCombination) {
        hotspot.focus();
        e.stopPropagation();
        return false;
      }
    });
  };

  /**
   * Release trap focus from hotspot
   */
  ImageHotspotsSheridan.Hotspot.prototype.releaseTrapFocus = function () {
    this.$element.off('keydown.trapfocus');
  };

  /**
   * Set title of hotspot element
   * @param {string} title Title to set for hotspot element
   */
  ImageHotspotsSheridan.Hotspot.prototype.setTitle = function (title) {
    this.$element.attr('title', title);
    this.$element.attr('aria-label', title);
  };

  ImageHotspotsSheridan.Hotspot.prototype.pause = function () {
    if (this.actionInstances) {
      this.actionInstances.forEach(function(actionInstance) {
        if (actionInstance.audio && 
            (actionInstance.audio.pause instanceof Function ||
            typeof actionInstance.audio.pause === 'function')) {
          actionInstance.audio.pause();
        }
      });
    };
  };

})(H5P.jQuery, H5P.ImageHotspotsSheridan);
