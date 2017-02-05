'use strict';

let moment = require("moment");
let _ = require("lodash");
let uuid = require("node-uuid");
let Utilities = require("../../Utilities");
let RazorPay = require("razorpay");
let request = require("request-promise");

let razorRequester = request.defaults({
  baseUrl: "https://api.razorpay.com/v1",
  auth: {
    user: "rzp_test_kk6Otoct4CqojT",
    pass: "PrrIbqnuGzd8EmY7zxwWoNhc"
  }
});

let razor = new RazorPay({
  key_id: "rzp_test_kk6Otoct4CqojT",
  key_secret: "PrrIbqnuGzd8EmY7zxwWoNhc"
});

module.exports = function(Booking) {
  Booking.book = (req, res, info, cb) => {
    let Customer = Booking.app.models.Customer;
    let Service = Booking.app.models.Service;
    Customer.find({where: {phoneNumber: info.phoneNumber, email: info.email}}, (error, customerQuery) => {
      if (error) return cb(error);

      let customerCreatePromise;

      function createBooking(customer) {
        Booking.create({
          timeSlot: moment(info.timeSlot).format("dddd, MMMM Do YYYY, h:mm:ss a"),
          location: info.location,
          address: info.address,
          customerId: customer.id,
          serviceId: info.serviceId
        }, (error, booking) => {
          if (error) return cb(error);

          Service.findById(info.serviceId).then(service => {
            let razorPay = {
              customer_id: customer.externalId,
              line_items: [{
                name: service.name,
                amount: service.price * 100,
              }],
              currency: "INR",
              type: "link",
              sms_notify: 0,
              email_notify: 0,
              receipt: booking.id
            };

            razorRequester.post({
              url: "/invoices",
              json: razorPay
            }).then((razorResponse) => {
              booking.payment.create({
                method: "razor",
                amount: service.price,
                paid: false,
                paymentLink: razorResponse.short_url
              }).then(() => {
                cb(null, booking);
              }).catch(error => cb(error));
            }).catch(error => cb(error));
          });
        });
      }

      function createCustomer(razorRes) {
        customerCreatePromise = Customer.create({
          email: info.email,
          firstName: info.firstName,
          password: uuid.v4(),
          phoneNumber: info.phoneNumber,
          externalId: razorRes.id
        });

        customerCreatePromise.then((response) => {
          createBooking(response);
        }).catch(console.log);
      }

      if (_.isEmpty(customerQuery)) {
        razor.customers.create({
          name: info.firstName,
          email: info.email,
          contact: info.phoneNumber
        }).then(razorRes => {
          createCustomer(razorRes);
        }).catch(error => {
          console.log(error.message);
          createCustomer({});
        });
      } else {
        createBooking(customerQuery[0]);
      }
    });
  };

  Booking.observe("after save", (ctx, next) => {
    let instance = ctx.instance;
    let MailingList = Booking.app.models.MailingList;

    Booking.findById(instance.id, {include: ["customer", "service"]}, (error, booking) => {
      if (error) {
        console.log(error);
        return next();
      }

      if (_.isEmpty(booking._payment)) {
        return next();
      }

      MailingList.find({where: {category: "booking-notification"}}, (error, mailers) => {
        if (error) {
          console.log(error);
          return next();
        }

        let mailList = "";
        _.each(mailers, (mailer, index) => {
          mailList += mailer.email + ((mailers.length - 1 === index) ? "" : ",");
        });

        let customerInfo = booking.customer();
        let serviceInfo = booking.service();

        Utilities.sendEmail({
          address: booking.address,
          firstName: customerInfo.firstName,
          phoneNumber: customerInfo.phoneNumber,
          serviceTitle: serviceInfo.name,
          serviceCost: serviceInfo.price,
          mailList: mailList,
          customerEmail: customerInfo.email,
          timeSlot: booking.timeSlot,
          paymentLink: booking._payment.paymentLink
        }, (error, infos) => {
          if (error) {
            console.log(error);
            return next();
          }

          _.each(infos, (info) => {
            console.log('Message %s sent: %s', info.messageId, info.response);
          });
          next();
        });
      });
    });
  });

  Booking.remoteMethod("book", {
    accepts: [
      {arg: "req", type: "object", http: {source: "req"}},
      {arg: "res", type: "object", http: {source: "res"}},
      {
        arg: "info",
        type: "object",
        required: true,
        http: {source: "body"},
        default: '{\n' +
        ' "firstName": "string",\n ' +
        '"phoneNumber": "string",\n ' +
        '"email": "string",\n ' +
        '"serviceId": "string",\n ' +
        '"timeSlot": "string",\n ' +
        '"location": "string",\n ' +
        '"address": "string"\n}'
      }
    ],
    returns: {type: "object", root: true},
    http: {path: "/book", verb: "post"}
  });
};
