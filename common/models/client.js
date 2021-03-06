'use strict';

module.exports = function(Client) {
  Client.getUser = (filter, cb) => {
    let Customer = Client.app.models.Customer;
    filter = filter || {};

    Customer.find(filter, (error, users) => {
      cb(error, users);
    });
  };

  Client.updateLead = (params, cb) => {
    let Customer = Client.app.models.Customer;

    Customer.updateAll({id: params.id},{lead: params.lead}, (error, users) => {
      cb(error, [users]);
    });
  }

  Client.remoteMethod('getUser', {
    accepts: {arg: 'filter', type: 'object', http: {source: 'body'}},
    returns: {arg: 'users', type: 'array', root: true},
    'http': {'verb': 'post', 'path': '/getUser'},
  });

  Client.remoteMethod('updateLead', {
    accepts: [
      {arg: 'params', type: 'object',  http: {source: 'body'}}
    ],
    returns: {arg: 'result', type: 'array', root: true},
    'http': {'verb': 'post', 'path': '/updateLead'},
  });
};
