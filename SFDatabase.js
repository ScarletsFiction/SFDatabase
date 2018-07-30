/*
	ScarletsFiction Database Library v1.1
	A simple database library for browser and nodejs
	https://github.com/ScarletsFiction/SFDatabase-js
	
	Make sure you include this header on this script
*/

'use strict';
if(typeof process !== 'undefined' && process.execPath){ // If Nodejs
	var mysql = require('mysql'); // npm install mysql
	module.exports = SFDatabase;
}

// Ext-AlaSQL.js are required for browser only if the browser didn't support WebSQL
function SFDatabase(databaseName, options, onConnected){
	var scope = this;
	scope.db = null;
	scope.pending = [];
	scope.initialized = false;
	if(!options)
		options = {debug:false};

	var initFinish = function(){
		if(scope.initialized) return;
		scope.initialized = true;

		var async = onConnected ? onConnected(resumePending) : false;
		if(!async) resumePending();
	}

	var pendingTimer = -1;
	var resumePending = function(){
		if(!scope.db){
			clearTimeout(pendingTimer);
			pendingTimer = setTimeout(resumePending, 1000);
			return;
		}
		if(!scope.pending.length) return;
		for (var i = 0; i < scope.pending.length; i++) {
			scope.pending[i]();
		}
		scope.pending.splice(0);
	}

	var databaseTest = function(errorCallback){
		scope.initialized = true;
		scope.SQLQuery('select 1', [], function(data){
			scope.initialized = false;
			if(data.length) initFinish(scope);
		}, function(){
			scope.initialized = false;
			errorCallback();
		});
	}

	var isNode = typeof process !== 'undefined' && process.execPath;
	if(isNode){
		scope.db = mysql.createPool({
			host:options.host?options.host:'localhost',
			user:options.user?options.user:'root',
			password:options.password?options.password:'',
			database:databaseName
		});

		if(onConnected) scope.db.on('connection', initFinish);
		if(!options.hideInitialization)
			console.log("Connecting to "+databaseName+" database");

		scope.SQLQuery = function(query, values, successCallback, errorCallback){
			if(!scope.initialized){
				scope.pending.push(function(){
					scope.SQLQuery(query, values, successCallback, errorCallback)
				});
				clearTimeout(pendingTimer);
				pendingTimer = setTimeout(resumePending, 1000);
				return;
			}

			if(options.debug) options.debug(query, values);

			scope.db.getConnection(function(err1, connection){
		        if(err1){
		            connection.release();
		            if(errorCallback) errorCallback(err1);
		            else console.error(err1);
		            return;
		        }

		        connection.query(query, values, function(err, rows){
		            connection.release();
		            destroyObject(values);
		            values = null;
		            query = null;

		            if(!err&&successCallback) setTimeout(function(){
		            	successCallback(rows);
		            }, 0);
		            else if(err) setTimeout(function(){
		            	var error = {msg:err.sqlMessage, query:err.sql, code:err.code};
			            if(errorCallback) errorCallback(error);
			            else console.error(error);
		            }, 0);
		        });
		    });
		}
		scope.initializeTable = function(){};
	}

	// Is browser
	if(!isNode){
		if(options.websql === undefined) options.websql = true;
		scope.SQLQuery = function(query, values, successCallback, errorCallback){
			if(!scope.initialized){
				scope.pending.push(function(){
					scope.SQLQuery(query, values, successCallback, errorCallback)
				});
				clearTimeout(pendingTimer);
				pendingTimer = setTimeout(resumePending, 1000);
				return;
			}

			if(options.debug) options.debug(query, values);
			if(scope.polyfill){
				try{
					alasql(query, values, successCallback);
				} catch(e) {
					if(errorCallback)
						errorCallback(e);
				}
				return;
			}

			scope.db.transaction(function(tx){
				tx.executeSql(query, values, function(tx, res){
					destroyObject(values);
		            values = query = null;

					if(successCallback){
						var readOnly = res&&res.rows?res.rows:res; // SQLResultSetRowList is immutable
						if(res && res.rowsAffected && !readOnly.length){
							successCallback(res.rowsAffected);
							readOnly = null;
							return;
						}
						if(readOnly.length){
							var result = {length:readOnly.length};
							for (var i = 0; i < readOnly.length; i++) {
								result[i] = readOnly[i];
							}
							readOnly = null;
							successCallback(result);
						}
						else successCallback([]);
		            }
				}, function(tx, error){
					var msg = 'Database Error: ' + error.message;
					destroyObject(values);
		            values = query = null;

					if(errorCallback) errorCallback(msg);
					else console.error(msg);
				});
			}, function(error){
				var msg = 'Database Transaction Error: ' + error.message;
				if(errorCallback) errorCallback(msg);
				else console.error(msg);
			});
		}

		scope.initializeTable = function(){
			if(options.websql){ // WebSQL
				if(window.sqlitePlugin){
					scope.db = window.sqlitePlugin.openDatabase({name: databaseName, location: 'default'});

					// Initialize sqlitePlugin
					databaseTest(function(error){
						console.error("Failed to initialize sqlitePlugin");
						window.sqlitePlugin = false;
						scope.initializeTable();
					});
				}
				else if(window.openDatabase){
					scope.db = window.openDatabase(databaseName, "1.0", databaseName, 1024);
					databaseTest(function(error){
						console.error("Failed to initialize WebSQL");
						window.openDatabase = false;
						options.websql = false;
						scope.initializeTable();
					});
				} else {
					options.websql = false;
					scope.initializeTable();
				}
			}
			else {
				//alert('WebSQL is not supported on this browser');
				var callback = function(){
					scope.polyfill = true;

				    scope.db = alasql.databases[databaseName];
				    if(!scope.db)
				    	scope.db = new alasql.Database(databaseName);
					initFinish(scope);
				};
				if(typeof alasql === 'undefined'){
					var script = document.createElement("script")
				    script.type = "text/javascript";

				    setTimeout(function(){
				    	if(typeof alasql === 'undefined')
				    		console.error("Failed to load AlaSQL");
				    }, 10000);
				    if (script.readyState){
				        script.onreadystatechange = function(){
				            if (script.readyState == "loaded" || script.readyState == "complete"){
				                script.onreadystatechange = null;
				                callback();
				            }
				        }
				    } else {
				        script.onload = function(){
				            callback();
				        }
				    }

				    script.src = "./Ext-AlaSQL.js";
				    document.getElementsByTagName("head")[0].appendChild(script);
				} else callback();
			}
		}
	}

	var destroyObject = function(obj){
		if(!obj || typeof obj !== 'object') return;
		if(obj instanceof Array)
			obj.splice(0);
		else {
			var objKeys = Object.keys(obj);
			for (var i = 0; i < objKeys.length; i++) {
				delete obj[objKeys[i]];
			}
		}
		obj = null;
	}

	scope.preprocessTable = {}; // {tableName:{columnName:{set:function, get:function}}}}
	var preprocessData = function(tableName, mode, object){
		var found = false;
		if(!scope.preprocessTable[tableName]) return found;

		var keys = Object.keys(scope.preprocessTable[tableName]);
		for (var i = 0; i < keys.length; i++) {
			if(!object[keys[i]] || !scope.preprocessTable[tableName][keys[i]][mode])
				continue;
			object[keys[i]] = scope.preprocessTable[tableName][keys[i]][mode](object[keys[i]]);
			found = true;
		}
		return found;
	}

	scope.validateText = function(text){
		var matches = text.match(/[a-zA-Z0-9_\.]+/i);
		return matches[0];
	}

	//{('AND', 'OR'), 'ORDER':{columnName:'ASC', 'DESC'}, 'LIMIT':[startIndex, rowsLimit]}

	// ex: ["AND"=>["id"=>12, "OR"=>["name#1"=>"myself", "name"=>"himself"]], "LIMIT"=>1]
		// Select one where (id == 12 && (name == "myself" || name == "himself"))
	scope.makeWhere = function(object, comparator, children){
		if(!object) return ['', []];
		var wheres = [];

		var objectData = [];
		var columns = Object.keys(object);
		var defaultConditional = ' AND ';
		var specialList = ['order', 'limit'];

		for(var i = 0; i < columns.length; i++){
			var value = object[columns[i]];

			var matches = columns[i].match(/([a-zA-Z0-9_\.]+)(\[(\>\=?|\<\=?|\!|\<\>|\>\<|\!?~)\])?/);
			var check = matches[1].toLowerCase();
			if(check=='and' || check=='or') continue;
			if(!children && specialList.indexOf(check)!==-1) continue;

			if(matches[3]){
				if((['>', '>=', '<', '<=']).indexOf(matches[3])!=-1)
				{
					if(!isNaN(value))
					{
						wheres.push(matches[1] + ' ' + matches[3] + ' ?');
						objectData.push(value);
						continue;
					}
					else {
						var msg = 'SQL where: value of ' + matches[1] + ' is non-numeric and can\'t be accepted';
						console.error(msg);
					}
				}
				else if(matches[3] == '!')
				{
					var type = value===null || value===undefined ? false : value.constructor.name;
					if(!type)
						wheres.push(matches[1] + ' IS NOT NULL');
					else{
						if(type=='Array'){
							var temp = [];
							for (var a = 0; a < value.length; a++) {
								temp.push('?');
							}
							wheres.push(matches[1] + ' NOT IN ('+ temp.join(', ') +')');
							objectData = objectData.concat(value);
						}

						else if(type=='Number' || type=='Boolean' || type=='String'){
							wheres.push(matches[1] + ' != ?');
							objectData.push(value);
						}

						else
							console.error('SQL where: value ' + matches[1] + ' with type ' + type + ' can\'t be accepted');
					}
				}
				else if (matches[3] == '~' || matches[3] == '!~')
				{
					if(value.constructor !== Array){
						value = [value];
					}

					var likes = [];
					for (var a = 0; a < value.length; a++) {
						likes.push(matches[1] + (matches[3] === '!~' ? ' NOT' : '') + ' LIKE ?');
						if(value.indexOf('%')==-1) value[a] = '%'+value[a]+'%';
						objectData.push(value[a]);
					}

                    wheres.push('('+likes.join(' OR ')+')');
				}
			} else {
				var type = value===null || value===undefined ? false : value.constructor.name;
				if(!type)
					wheres.push(matches[1] + ' IS NULL');
				else{
					if(type=='Array'){
						var temp = [];
						for (var a = 0; a < value.length; a++) {
							temp.push('?');
						}
						wheres.push(matches[1] + ' IN ('+ temp.join(', ') +')');
						objectData = objectData.concat(value);
					}

					else if(type=='Number' || type=='Boolean' || type=='String'){
						wheres.push(matches[1] + ' = ?');
						objectData.push(value);
					}

					else
						console.error('SQL where: value ' + matches[1] + ' with type ' + type + ' can\'t be accepted');
				}
			}
		}

		for (var i = 0; i < columns.length; i++) {
			if(columns[i]=='ORDER'||columns[i]=='LIMIT')
                continue;

			var test = columns[i].split('AND');
			var haveRelation = false;
			if(test.length == 2 && test[0] == ''){
				defaultConditional = ' AND ';
				haveRelation = true;
			}
			else{
				test = columns[i].split('OR');
				if(test.length == 2 && test[0] == ''){
					defaultConditional = ' OR ';
					haveRelation = true;
				}
			}
			if(haveRelation){
				var childs = scope.makeWhere(object[columns[i]], defaultConditional, true);
				wheres.push('('+childs[0]+')');
				objectData = objectData.concat(childs[1]);
			}
		}

		var options = '';
		if(object['ORDER']){
			var columns = Object.keys(object['ORDER']);
			var stack = [];
			for(var i = 0; i < columns.length; i++){
				var order = object['ORDER'][columns[i]].toUpperCase();
				if(order != 'ASC' && order != 'DESC') continue;
				stack.push(scope.validateText(columns[i]) + ' ' + order);
			}
			options = options + ' ORDER BY ' + stack.join(', ');
		}
		if(object['LIMIT']){
			if(!isNaN(object['LIMIT'][0]) && !isNaN(object['LIMIT'][1])){
				options = options + ' LIMIT ' + object['LIMIT'][1] + ' OFFSET ' + object['LIMIT'][0];
			}
			else if(!isNaN(object['LIMIT'])){
				options = options + ' LIMIT '+ object['LIMIT'];
			}
		}
		
		var where_ = '';
		if(wheres.length!=0){
			if(!children)
				where_ = " WHERE ";
			where_ = where_ + wheres.join(comparator ? comparator : defaultConditional);
		}

		return [where_ + options, objectData];
	}

	scope.createTable = function(tableName, columns, successCallback, errorCallback)
	{
		var columns_ = Object.keys(columns);
		for(var i = 0; i < columns_.length; i++){
			if(columns[columns_[i]].constructor.name == 'Array')
				columns_[i] = scope.validateText(columns_[i])+' '+columns[columns_[i]][0].toUpperCase()+' '+scope.validateText(columns[columns_[i]][1]);
			else
				columns_[i] = scope.validateText(columns_[i])+' '+String(columns[columns_[i]]).toUpperCase();
		}
		var query = 'CREATE TABLE IF NOT EXISTS '+scope.validateText(tableName)+' ('+columns_.join(', ')+')';

		scope.SQLQuery(query, [], successCallback, errorCallback);
	}

	//Select separated by comma
	scope.select = function(tableName, select, where, successCallback, errorCallback){
		var select_ = select;
		if(select!='*')
			for(var i = 0; i < select_.length; i++){
				select_[i] = scope.validateText(select_[i]);
			}
		else select_ = false;
		var wheres = scope.makeWhere(where);
		var query = "SELECT " + (select_?select_.join(', '):select) + " FROM " + scope.validateText(tableName) + wheres[0];
		scope.SQLQuery(query, wheres[1], function(data){
			if(!successCallback) return;
			if(data.length!=0 && preprocessData(tableName, 'get', data[0])){
				for (var i = 1; i < data.length; i++) {
					preprocessData(tableName, 'get', data[i]);
				}
			}
			successCallback(data);
		}, errorCallback);
	}

	scope.delete = function(tableName, where, successCallback, errorCallback){
		if(where){
			var wheres = scope.makeWhere(where);
			var query = "DELETE FROM " + scope.validateText(tableName) + wheres[0];
			scope.SQLQuery(query, wheres[1], successCallback, errorCallback);
		}
		else{
			var query = "TRUNCATE TABLE " + scope.validateText(tableName);
			scope.SQLQuery(query, [], successCallback, function(msg){
				if(msg.indexOf('syntax error')!==-1) // WebSQL may not support truncate function
					scope.delete(tableName, [], successCallback, errorCallback);
			});
		}
	}

	scope.insert = function(tableName, object, successCallback, errorCallback){
		var objectName = [];
		var objectName_ = [];
		var objectData = [];
		var object_ = JSON.parse(JSON.stringify(object)); // Object copy before preprocessData
		var columns = Object.keys(object_);
		preprocessData(tableName, 'set', object_);
		for(var i = 0; i < columns.length; i++){
			objectName.push(scope.validateText(columns[i]));
			objectName_.push('?');

			objectData.push(object_[columns[i]]);
		}
		var query = "INSERT INTO " + scope.validateText(tableName) + " (" + objectName.join(', ') + ") VALUES (" + objectName_.join(', ') + ")";
		
		scope.SQLQuery(query, objectData, successCallback, errorCallback);
	}

	scope.update = function(tableName, object, where, successCallback, errorCallback){
		var wheres = scope.makeWhere(where);
		var objectName = [];
		var objectData = [];
		var object_ = JSON.parse(JSON.stringify(object)); // Object copy before preprocessData
		var columns = Object.keys(object_);
		preprocessData(tableName, 'set', object_);
		for(var i = 0; i < columns.length; i++){
			objectName.push(scope.validateText(columns[i])+' = ?');
			objectData.push(object_[columns[i]]);
		}
		var query = "UPDATE " + scope.validateText(tableName) + " SET " + objectName.join(', ') + wheres[0];
		scope.SQLQuery(query, objectData.concat(wheres[1]), successCallback, errorCallback);
	}

	scope.drop = function(tableName, successCallback, errorCallback){
		scope.SQLQuery("DROP TABLE "+scope.validateText(tableName), [], successCallback, errorCallback);
	}

	scope.closeDatabase = function(){
		if(scope.polyfill) return;
		scope.db.close(function(){
			// Success
		}, function(error){
			var msg = "Error closing Database:" + error.message;
			if(errorCallback) errorCallback(msg);
			else console.error(msg);
		});
	}

	if(!isNode)
		scope.initializeTable();
}

// Old browser Fix
if(Function.prototype.name === undefined){
    Object.defineProperty(Function.prototype, 'name', {
        get:function(){
        	if(!this.__name)
        		this.__name = this.toString().split('(', 1)[0].split(' ')[1];
        	return this.__name;
        }
    });
}