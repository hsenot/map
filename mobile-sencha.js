Ext.ns('App');

App.LayerList = Ext.extend(Ext.List, {
    
    map: null,
    
    createStore: function(){
        Ext.regModel('Layer', {
            fields: ['id', 'name', 'visibility', 'zindex']
        });
        var data = [];
        Ext.each(this.map.layers, function(layer){
            if (layer.displayInLayerSwitcher === true) {
                var visibility = layer.isBaseLayer ? (this.map.baseLayer == layer) : layer.getVisibility();
                data.push({
                    id: layer.id,
                    name: layer.name,
                    visibility: visibility,
                    zindex: layer.getZIndex()
                });
            }
        });
        return new Ext.data.Store({
            model: 'Layer',
            sorters: 'zindex',
            data: data
        });
    },
    
    initComponent: function(){
        this.store = this.createStore();
        this.itemTpl = new Ext.XTemplate(
            '<tpl if="visibility == true">', 
                '<img width="20" src="img/check-round-green.png">', 
            '</tpl>', 
            '<tpl if="visibility == false">', 
                '<img width="20" src="img/check-round-grey.png">', 
            '</tpl>', 
            '<span class="gx-layer-item">{name}</span>'
        );
        this.listeners = {
            itemtap: function(dataview, index, item, e){
                var record = dataview.getStore().getAt(index);
                var layer = this.map.getLayersBy("id", record.get("id"))[0];
                if (layer.isBaseLayer) {
                    this.map.setBaseLayer(layer);
                }
                else {
                    layer.setVisibility(!layer.getVisibility());
                }
                record.set("visibility", layer.getVisibility());
            }
        };
        this.map.events.on({
            "changelayer": this.onChangeLayer,
            scope: this
        });
        App.LayerList.superclass.initComponent.call(this);
    },

    findLayerRecord: function(layer){
        var found;
        this.store.each(function(record){
            if (record.get("id") === layer.id) {
                found = record;
            }
        }, this);
        return found;
    },
    
    onChangeLayer: function(evt){
        if (evt.property == "visibility") {
            var record = this.findLayerRecord(evt.layer);
            record.set("visibility", evt.layer.getVisibility());
        }
    }
    
});
Ext.reg('app_layerlist', App.LayerList);

App.CaptureFormPopupPanel = Ext.extend(Ext.Panel, {
	map: null,
	propertyAddressStore: null,
	floating: true,
	modal: true,
	centered: true,
	// Deactivated mask on tap to allow for selection in the drop down list
	hideOnMaskTap: false,
	width: Ext.is.Phone ? undefined : 400,
	height: Ext.is.Phone ? undefined : 400,
	scroll: false,
	layout: 'fit',
	fullscreen: Ext.is.Phone ? true : undefined,
	//    url: '/ws/rest/v3/capture/ws_property_fire_hazard.php',
	errorText: 'Sorry, we had problems communicating with the Pozi server. Please try again.',
	errorTitle: 'Communication error',
        
	initComponent: function(){
		Ext.regModel('PropertyAddress', {
			// Potential issue if property numbers are repeated or missing - would be better to use a real PK for the Id field
			idProperty:'prop_num',
			fields: [
				{name: 'label',     type: 'string', mapping: 'row.label'},
				{name: 'prop_num',    type: 'string', mapping: 'row.prop_num'},
				{name: 'x',     type: 'string', mapping: 'row.x'},
				{name: 'y',     type: 'string', mapping: 'row.y'}
			]
		});

		Ext.regModel('ReferenceTable', {
			// Potential issue if property numbers are repeated or missing - would be better to use a real PK for the Id field
			idProperty:'id',
			fields: [
				{name: 'id',     type: 'string'},
				{name: 'label',    type: 'string'}
			]
		});

		// Be careful to the refresh timeline of the content - it has to be refreshed each time the form is invoked
		propertyAddressStore = new Ext.data.JsonStore({
			proxy: {
				type: 'scripttag',
				url : 'http://basemap.pozi.com/ws/rest/v3/ws_closest_properties.php',
				reader: {
					type: 'json',
					root: 'rows',
					totalCount : 'total_rows'
				}
			},
			// Max number of records returned
			pageSize: 10,	
			model : 'PropertyAddress',
			autoLoad : false,
			autoDestroy : true,
			listeners: {
				load: function(ds,records,o) {
					var cb = Ext.getCmp('prop_num');
					var rec = records[0];
					cb.setValue(rec.data.type);
					cb.fireEvent('select',cb,rec);
					},
				scope: this
			}
		});
		
		colorStore = new Ext.data.JsonStore({
	           data : [
				{ id : 'FFFFFF',  label : 'White'},
				{ id : '0000FF', label : 'Blue'},
				{ id : 'FF0000', label : 'Red'},
				{ id : 'FFFF00', label : 'Yellow'},
				{ id : '00FF00', label : 'Green'}
	           ],
	           model: 'ReferenceTable'
	        });

		this.formContainer = new Ext.form.FormPanel({
			id:'form_capture',
			scroll: false,
			items: [{
				xtype: 'fieldset',
				scroll: false,
				title: 'Details of the new resource',
				items: [{
                                        xtype: 'textfield',
                                        label: 'Description',
                                        name:'description'
                                },
				{
					xtype: 'textareafield',
					label: 'Comments',
					name:'comments'
		                },
				{
					xtype: 'selectfield',
					label: 'Color',
					name:'color',
					id:'color',
					valueField : 'id',
					displayField : 'label',
					store : colorStore,
					// By construction, this field will always be populated - so we technically don't have to mark it as required
					 required: true
		                },
				{  
					xtype:'hiddenfield',
					name:'lat', 
					value: map.getCenter().transform(sm,gg).lat
				},
				{  
					xtype:'hiddenfield',
					name:'lon',
					value: map.getCenter().transform(sm,gg).lon
				},
				{  
					xtype:'hiddenfield',
					name:'config',
					value: 'resourcegis'
				}  				
		                ]
			}],
			dockedItems: [{
				xtype: 'toolbar',
				dock: 'bottom',
				items: [{
					text: 'Cancel',
					handler: function() {
						Ext.getCmp('form_capture').reset();
						app.captureFormPopupPanel.hide();
					}
				},
				{xtype: 'spacer'},
				{
					text: 'Save',
					ui: 'confirm',
					handler: function() {
						// Escape the text fields
                        var form_id = Ext.getCmp('form_capture');
						form_id.setValues({
                            // The escaping of single quotes is for Postgres
                            // This logic should be moved somewhere else (PHP service?)
                            description: encodeURI(form_id.getValues().description.replace(/'/g, "''")),
                            comments: encodeURI(form_id.getValues().comments.replace(/'/g, "''"))
						});                    
                    
						Ext.getCmp('form_capture').submit({
							url: '/ws/rest/v3/ws_create_resource.php',
							submitEmptyText: false,
							method: 'POST',
							waitMsg: 'Saving ...',
							success: on_capture_success,
							failure: on_capture_failure
						});
					}
				}]
			}]
		});
        
		var on_capture_success = function(form, action){
			//Ext.getCmp('form_capture').reset();
			app.captureFormPopupPanel.hide();
			Ext.getCmp('form_capture').reset();
			
			// Reload the vector layer - it should contain the new point
			getFeatures();
		};

		var on_capture_failure = function(form, action){
			alert("Capture failed");
		};
        
		this.items = [{
			xtype: 'panel',
			layout: 'fit',
			items: [this.formContainer]
		}];
		App.CaptureFormPopupPanel.superclass.initComponent.call(this);
	}

});



App.CaptureUpdateFormPopupPanel = Ext.extend(Ext.Panel, {
	map: null,
	feature: null,
	floating: true,
	modal: true,
	centered: true,
	// Deactivated mask on tap to allow for selection in the drop down list
	hideOnMaskTap: false,
	width: Ext.is.Phone ? undefined : 400,
	height: Ext.is.Phone ? undefined : 400,
	scroll: false,
	layout: 'fit',
	fullscreen: Ext.is.Phone ? true : undefined,
	errorText: 'Sorry, we had problems communicating with the Pozi server. Please try again.',
	errorTitle: 'Communication error',

	setFeature: function(f){
		this.formContainer.setValues({
			'description':decodeURI(f.data.description),
			'comments':decodeURI(f.data.comments),
			'color':f.data.color,
			'id':f.data.id
		});
		
	},
        
	initComponent: function(){
		Ext.regModel('ReferenceTable', {
			// Potential issue if property numbers are repeated or missing - would be better to use a real PK for the Id field
			idProperty:'id',
			fields: [
				{name: 'id',     type: 'string'},
				{name: 'label',    type: 'string'}
			]
		});
    
		colorStore = new Ext.data.JsonStore({
                   data : [
                                { id : 'FFFFFF',  label : 'White'},
                                { id : '0000FF', label : 'Blue'},
                                { id : 'FF0000', label : 'Red'},
                                { id : 'FFFF00', label : 'Yellow'},
                                { id : '00FF00', label : 'Green'}
                   ],
                   model: 'ReferenceTable'
                });

                this.formContainer = new Ext.form.FormPanel({
                        id:'form_capture_update',
                        scroll: false,
                        items: [{
                                xtype: 'fieldset',
                                scroll: false,
                                title: 'Details of the resource',
                                items: [{
                                        xtype: 'textfield',
                                        label: 'Description',
                                        name:'description'
                                },
                                {
                                        xtype: 'textareafield',
                                        label: 'Comments',
                                        name:'comments'
                                },
                                {
                                        xtype: 'selectfield',
                                        label: 'Color',
                                        name:'color',
                                        id:'color',
                                        valueField : 'id',
                                        displayField : 'label',
                                        store : colorStore,
                                        // By construction, this field will always be populated - so we technically don't have to mark it as required
                                         required: true
                                },
                                {
                                        xtype:'hiddenfield',
                                        name:'config',
                                        value: 'resourcegis'
                                },
				{
					xtype:'hiddenfield',
					name:'id'
				}
                                ]
                        }],           
			dockedItems: [{
				xtype: 'toolbar',
				dock: 'bottom',
				items: [{
					text: 'Cancel',
					handler: function() {
						// Something wrong in this handler - we can't click twice on the same pin
						//Ext.getCmp('form_capture_update').reset();
						app.captureUpdateFormPopupPanel.hide();
						Ext.getCmp('form_capture_update').reset();
						selectControl.unselectAll();
					}
				},
				{xtype: 'spacer'},
				{
				    text: 'Delete',
				    ui: 'decline-round',
				    handler: function() {
				    
					Ext.Msg.confirm("Are you sure you want to delete this resource? This operation can not be undone.", "", 
						function(e){
							if(e == 'yes')
							{
								// Call the delete service	
								Ext.Ajax.request({
								  loadMask: true,
								  url: '/ws/rest/v3/ws_delete_resource.php',
								  params: {
										id: clickedFeature.data.id,
										config: 'resourcegis'
									},
								  success: on_capture_success,
								  failure: on_capture_failure
								});
							}
						}
				    	);		

				    }			
				},
				{xtype: 'spacer'},				
				{
					text: 'Save',
					ui: 'confirm',
					handler: function() {	
						// Set ID of the clicked feature and escape the text fields
                        var form_id = Ext.getCmp('form_capture_update');
						form_id.setValues({
							id: clickedFeature.data.id,
                            // The escaping of single quotes is for Postgres
                            // This logic should be moved somewhere else (PHP service?)
                            description: encodeURI(form_id.getValues().description.replace(/'/g, "''")),
                            comments: encodeURI(form_id.getValues().comments.replace(/'/g, "''"))
						});

						Ext.getCmp('form_capture_update').submit({
							url: '/ws/rest/v3/ws_update_resource.php',
							submitEmptyText: false,
							method: 'POST',
							waitMsg: 'Saving ...',
							success: on_capture_success,
							failure: on_capture_failure
						});
					}
				}]
			}]
		});
        
		var on_capture_success = function(form, action){
			// Important: clear the store elements before resetting the form
			//Ext.getCmp('form_capture_update').reset();
			app.captureUpdateFormPopupPanel.hide();
			Ext.getCmp('form_capture_update').reset();
			
			// Reload the vector layer - it should contain the new point
			getFeatures();
		};

		var on_capture_failure = function(form, action){
			alert("Capture failed");
		};
        
		this.items = [{
			xtype: 'panel',
			layout: 'fit',
			items: [this.formContainer]
		}];
		App.CaptureUpdateFormPopupPanel.superclass.initComponent.call(this);
	}
});
