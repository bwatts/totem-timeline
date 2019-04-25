import { HubConnectionBuilder } from "@aspnet/signalr";
import Timeline from "totem-timeline";

let connection = null;
let connectionStart = null;

export default {
  enable: (url, configure) => {
    let onChanged = Timeline.configureQueryHub({ subscribeToChanged, unsubscribeFromChanged });

    let builder = new HubConnectionBuilder().withUrl(url || "/hubs/query");

    if(configure) {
      configure(builder);
    }

    connection = builder.build();

    connection.on("onChanged", onChanged);

    connectionStart = connection.start();
  }
};

function subscribeToChanged(etag) {
  return connectionStart.then(() => connection.invoke("SubscribeToChanged", etag));
}

function unsubscribeFromChanged(key) {
  return connectionStart.then(() => connection.invoke("UnsubscribeFromChanged", key));
}