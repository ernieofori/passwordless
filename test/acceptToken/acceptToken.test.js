'use strict';

var expect = require('chai').expect;
var express = require('express');
var request = require('supertest');
var bodyParser = require('body-parser')
var Passwordless = require('../../').Passwordless;
var TokenStoreMock = require('../mock/tokenstoremock');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');
var flash = require('connect-flash');

describe('passwordless', function() {
	describe('acceptToken()', function() {
		it('should not influence the delivery of unrestricted assets', function (done) {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			app.use(passwordless.acceptToken());

			app.get('/unrestricted',
				function(req, res){
					res.send(200);
			});

			request(app)
				.get('/unrestricted')
				.expect(200, done);
		})

		it('should return an internal server error if DataStore does return error', function (done) {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			app.use(passwordless.acceptToken());

			app.get('/unrestricted', function(req, res) {
					res.send(200);
			});

			request(app)
				.get('/unrestricted?token=error&uid=error')
				.expect(500, done);
		})

		it('should throw an exception if used without initialized TokenStore', function (done) {

			var app = express();
			var passwordless = new Passwordless();

			app.use(passwordless.acceptToken());

			app.get('/unrestricted', function(req, res) {
					res.send(200);
			});

			request(app)
				.get('/unrestricted')
				.expect(500, done);
		})

		describe('restricted resources', function() {

			describe('with no further options', function() {
				runTestsWithOptions();
			})

			describe('with tokenField and uidField options set', function() {
				runTestsWithOptions('t', 'u');
			})

			describe('with tokenField option set', function() {
				runTestsWithOptions('t', null);
			})

			describe('with uidField option set', function() {
				runTestsWithOptions(null, 'u');
			})

			function runTestsWithOptions(tokenField, uidField) {

				var app = express();
				var passwordless = new Passwordless();
				passwordless.init(new TokenStoreMock());

				if(tokenField || uidField) {
					var options = {};
					if(tokenField)
						options.tokenField = tokenField;
					if(uidField)
						options.uidField = uidField;
					app.use(passwordless.acceptToken(options));
				} else {
					app.use(passwordless.acceptToken());
				}
				
				tokenField = (tokenField) ? tokenField : 'token';
				uidField = (uidField) ? uidField : 'uid';

				function buildQueryString(token, uid) {
					var str = tokenField + '=' + token;
					str += '&' + uidField + '=' + uid;
					return str;
				}


				app.get('/restricted', passwordless.restricted(),
					function(req, res){
						res.send(200, 'authenticated');
				});

				app.post('/restricted', passwordless.restricted(),
					function(req, res){
						res.send(200, 'authenticated');
				});

				it('should not give access to restricted resources and return 401 if no token / uid is provided', function (done) {
					request(app)
						.get('/restricted')
						.expect(401, done);
				})

				it('should not give access to restricted resources and return 401 if the passed token is empty', function (done) {
					request(app)
						.get('/restricted?' + buildQueryString('', 'valid'))
						.expect(401, done);
				})

				it('should not give access to restricted resources and return 401 if the passed uid is empty', function (done) {
					request(app)
						.get('/restricted?' + buildQueryString('valid', ''))
						.expect(401, done);
				})

				it('should not give access to restricted resources and return 401 if the passed token/uid is invalid', function (done) {
					request(app)
						.get('/restricted?' + buildQueryString('invalid', 'invalid'))
						.expect(401, done);
				})

				it('should give access to restricted resources if supplied token is valid', function (done) {
					request(app)
						.get('/restricted?' + buildQueryString('valid', 'valid'))
						.expect(200, done);
				})

				it('should not give access to restricted resources if supplied token is valid but POST', function (done) {
					request(app)
						.post('/restricted')
						.send('{ "' + tokenField + '" : "valid", "' + uidField + '" : "valid" }')
						.expect(401, done);
				})
			}
		})

		describe('allow POST tokens', function() {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			app.use(bodyParser());
			app.use(passwordless.acceptToken( { allowPost: true } ));

			app.post('/restricted', passwordless.restricted(),
				function(req, res){
					res.send(200, 'authenticated');
			});

			it('should give access if supplied token/uid is valid (POST) and POST is allowed', function (done) {
				request(app)
					.post('/restricted')
					.send({ token: 'valid', uid: 'valid' })
					.expect(200, done);
			})
		})

		describe('POST tokens without body-parser', function() {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			it('should throw an exception', function (done) {
				app.use(passwordless.acceptToken( { allowPost: true } ));

				app.post('/restricted', passwordless.restricted(),
					function(req, res){
						res.send(200, 'authenticated');
				});

				request(app)
					.post('/restricted')
					.send({ token: 'valid', uid: 'valid' })
					.expect(500, done);
			})
		})
		
		describe('unrestricted resources', function() {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			app.use(passwordless.acceptToken());

			app.get('/unrestricted',
				function(req, res){
					res.send(200);
			});

			it('should deliver unrestricted resources if supplied token/uid is empty', function (done) {
				request(app)
					.get('/unrestricted?token=&uid=')
					.expect(200, done);
			})

			it('should deliver unrestricted resources if supplied token/uid is invalid', function (done) {
				request(app)
					.get('/unrestricted?token=invalid&uid=invalid')
					.expect(200, done);
			})
		})
		
		it('should flash an error message if supplied token/uid is invalid and "flashInvalidToken" is supplied', function (done) {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			app.use(cookieParser());
			app.use(expressSession({ secret: '42' }));

			app.use(flash());

			app.use(passwordless.acceptToken({ flashInvalidToken: 'The submitted token for the given uid is not valid' }));

			app.get('/unrestricted',
				function(req, res){
					res.send(200, req.flash('passwordless')[0]);
			});

			request(app)
				.get('/unrestricted?token=invalid&uid=invalid')
				.expect(200, 'The submitted token for the given uid is not valid', done);
		})

		it('should throw an exception if flashInvalidToken is used without flash middleware', function (done) {

			var app = express();
			var passwordless = new Passwordless();
			passwordless.init(new TokenStoreMock());

			app.use(passwordless.acceptToken({ flashInvalidToken: 'The submitted token is not valid' }));

			app.get('/unrestricted',
				function(req, res){
					res.send(200);
			});

			request(app)
				.get('/unrestricted?token=invalid&uid=invalid')
				.expect(500, done);
		})
	})
});