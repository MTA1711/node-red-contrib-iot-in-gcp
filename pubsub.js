module.exports = function(RED) {
    "use strict";

    const STATUS_CONNECTED = {
        fill:  "green",
        shape: "dot",
        text:  "connected"
    };

    const STATUS_DISCONNECTED = {
        fill:  "red",
        shape: "dot",
        text:  "disconnected"
    };

    const STATUS_CONNECTING = {
        fill:  "yellow",
        shape: "dot",
        text:  "connecting"
    };

    const {PubSub} = require("@google-cloud/pubsub");

    /**
     * Extract JSON service account key from "google-cloud-credentials" config node.
     */
    function GetCredentials(node) {
        return JSON.parse(RED.nodes.getCredentials(node).account);
    }

    function PubSubReceive(config) {
        let pubsub       = null;
        let subscription = null;

        let credentials = null;
        if (config.account) {
            credentials = GetCredentials(config.account);
        }
        const keyFilename = config.keyFilename;

        RED.nodes.createNode(this, config);

        const node = this;

        let options = {};

        if (!config.subscription) {
            node.error('Subscription is required');
            return;
        }

        options.subscription = config.subscription;
        options.assumeJSON = config.assumeJSON;

        node.status(STATUS_DISCONNECTED);

        // Called when a new message is received from PubSub.
        function OnMessage(message) {
            if (message === null) {
                return;
            }

            const msg = {
                "payload": message.data,    // Save the payload data at msg.payload
                "message": message          // Save the original message at msg.message
            };

            // If the configuration property asked for JSON, then convert to an object.
            if (config.assumeJSON === true) {
                msg.payload = JSON.parse(RED.util.ensureString(message.data));
            }

            node.send(msg);
            message.ack();
        } // OnMessage


        function OnClose() {
            node.status(STATUS_DISCONNECTED);
            if (subscription) {
                subscription.close();  // No longer receive messages.
                subscription.removeListener('message', OnMessage);
                subscription.removeListener('error', OnError);
                subscription = null;
            }
            pubsub = null;
        } // OnClose


        // We must have EITHER credentials or a keyFilename.  If neither are supplied, that
        // is an error.  If both are supplied, then credentials will be used.
        if (credentials) {
            pubsub = new PubSub({
                "credentials": credentials
            });
        } else if (keyFilename) {
            pubsub = new PubSub({
                "keyFilename": keyFilename
            });
        } else {
            pubsub = new PubSub({});
        }

        node.status(STATUS_CONNECTING);                              // Flag the node as connecting.
        pubsub.subscription(options.subscription).get().then((data) => {
            subscription = data[0];
            subscription.on('message', OnMessage);
            subscription.on('error',   OnClose);
            node.status(STATUS_CONNECTED);
        }).catch((reason) => {
            node.error(reason);
            node.status(STATUS_DISCONNECTED);
        });


        node.on("close", OnClose);
    } // PubSubReceive

    RED.nodes.registerType("google-cloud-pubsub receive", PubSubReceive);
};