import { appendEvent } from "./flows";

let queryHub = null;
let types = new Set();
let clientsByKey = new Map();

export function configureQueryHub(hub) {
  queryHub = hub;

  return etag => {
    let parsedETag = QueryETag.tryFrom(etag);

    if(parsedETag) {
      loadClients(parsedETag.key);
    }
  };
}

export function declareWebRequest(loadedEventType, url, options) {
  let type = new WebRequestType(loadedEventType, url, options);

  types.add(type);

  return {
    bind: (args, notify) => type.bind(args, notify)
  };
}

//
// Client lifecycle
//

function addClientByKey(client) {
  let clients = clientsByKey.get(client.key);

  if(!clients) {
    clients = new Set();

    clientsByKey.set(client.key, clients);
  }

  clients.add(client);
}

function deleteClient(client) {
  if(!client.key) {
    return;
  }

  let clients = clientsByKey.get(client.key);

  if(clients) {
    clients.delete(client);

    if(clients.size === 0) {
      clientsByKey.delete(client.key);
    }
  }
}

function loadClients(key) {
  let clients = clientsByKey.get(key);

  if(clients) {
    for(let client of clients) {
      client.startLoading();
    }
  }
}

//
// A type of request for data from the web
//

class WebRequestType {
  constructor(loadedEventType, url, options) {
    this.loadedEventType = loadedEventType;
    this.url = url;
    this.options = options;
  }

  bind(args, notify) {
    return new WebRequestBinding(this, args, notify);
  }

  resolveOptions(args) {
    return new WebRequestTypeOptions(this.url, this.options, args);
  }

  appendLoaded(data) {
    appendEvent(null, this.loadedEventType, data);
  }
}

//
// Options declared for GET requests to a web resource
//

class WebRequestTypeOptions {
  constructor(url, options, args) {
    if(typeof args === "function") {
      args = args();
    }

    if(typeof url === "function") {
      url = url(args);
    }
    
    if(typeof options === "function") {
      options = options(args);
    }
    
    this.url = url;
    this.options = options;
  }

  shouldResubscribe(current) {
    return current.url !== this.url;
  }

  getJson() {
    return fetch(this.url, this.options);
  }
}

//
// Fetches and possibly observes changes in a web resource
//

class WebRequestBinding {
  constructor(type, args, notify) {
    this.type = type;
    this.args = args;
    this.notify = notify;

    this.options = this.resolveOptions();
    this.client = new WebClient(this.options);
  }

  get data() {
    return this.client.data;
  }

  resolveOptions() {
    return this.type.resolveOptions(this.args);
  }

  subscribe() {
    this.client.subscribe(this);
  }

  resubscribeIfArgsChanged() {
    let current = this.options;
    let next = this.resolveOptions();

    if(next.shouldResubscribe(current)) {
      this.options = next;

      this.client.resubscribe(next);

      this.notify();
    }
  }

  unsubscribe() {
    this.client.unsubscribe(this);
  }
}

//
// Fetches a web resource and notifies bindings of changes
//

class WebClient {
  bindings = new Set();

  constructor(options) {
    this.options = options;

    this.state = new WebClientState(this);

    this.data = this.state.toData();
  }

  get key() {
    return this.state.etag ? this.state.etag.key : null;
  }

  notify() {
    this.data = this.state.toData();

    for(let binding of this.bindings) {
      binding.notify();
    }
  }

  subscribe(binding) {
    this.bindings.add(binding);

    if(this.bindings.size === 1) {
      this.startLoading();
    }
  }

  resubscribe(options) {
    this.options = options;

    this.startLoading();
  }

  unsubscribe(binding) {
    this.bindings.delete(binding);

    if(this.bindings.size === 0) {
      this.startUnsubscribing();

      deleteClient(this);
    }
  }
  
  startLoading() {
    if(this.state.loading) {
      return;
    }

    this.state.setLoading();
    
    this.options.getJson().then(
      response => response.ok ? this.setLoaded(response) : this.setLoadError(response),
      error => this.state.setLoadError(error));
  }
  
  setLoaded(response) {
    return response.json().then(data => {
      this.state.setLoaded(response, data);
        
      for(let binding of this.bindings) {
        binding.type.appendLoaded(data);
      }

      this.startSubscribing();
    });
  }
  
  setLoadError(response) {
    if(response.status === 404) {
      this.state.setLoad404(response);
      this.startSubscribing();
    }
    else {
      this.state.setLoadError(new TypeError(`Unexpected response status ${response.status} from query at ${response.url}`));
    }
  }
  
  startSubscribing() {
    let { subscribing, subscribed, etag } = this.state;

    if(!queryHub || subscribing || subscribed || !etag) {
      return;
    }

    addClientByKey(this);

    this.state.setSubscribing();
    
    queryHub.subscribeToChanged(etag.toString()).then(
      () => this.state.setSubscribed(),
      error => this.state.setSubscribeError(error));
  }

  startUnsubscribing() {
    let { etag } = this.state;
    
    if(etag) {
      queryHub.unsubscribeFromChanged(etag.toString()).catch(error => {/* Binding is already gone */});
    }
  }
}

//
// The observable state of a WebClient
//

class WebClientState {
  loading = false;
  loaded = false;
  loadError = null;
  subscribing = false;
  subscribed = false;
  subscribeError = null;
  etag = null;
  data = {};

  constructor(client) {
    this.client = client;
  }

  toData() {
    let data = Object.assign({}, this);

    delete data.client;

    return data;
  }

  setLoading() {
    this.loading = true;

    this.client.notify();
  }

  setLoaded(response, data) {
    this.loading = false;
    this.loaded = true;
    this.loadError = null;
    this.etag = QueryETag.tryFromHeader(response);
    this.data = data;

    this.client.notify();
  }

  setLoad404(response) {
    this.loading = false;
    this.loaded = false;
    this.loadError = new Error("Query not found");
    this.etag = QueryETag.tryFromHeader(response);
    this.data = {};

    this.client.notify();
  }

  setLoadError(error) {
    this.loading = false;
    this.loaded = false;
    this.loadError = error;
    this.etag = null;
    this.data = {};

    this.client.notify();
  }

  setSubscribing() {
    this.subscribing = true;

    this.client.notify();
  }

  setSubscribed() {
    this.subscribing = false;
    this.subscribed = true;
    this.subscribeError = null;

    this.client.notify();
  }

  setSubscribeError(error) {
    this.subscribing = false;
    this.subscribed = false;
    this.subscribeError = error;

    this.client.notify();
  }
}

//
// The key and position of a server query
//

class QueryETag {
  constructor(key, checkpoint) {
    this.key = key;
    this.checkpoint = checkpoint;
  }

  toString() {
    return this.checkpoint === null ? this.key : `${this.key}@${this.checkpoint}`;
  }

  static tryFrom(value) {
    if(value) {
      let separatorIndex = value.indexOf("@");

      if(separatorIndex == -1) {
        return new QueryETag(value, null);
      }

      if(separatorIndex > 0 && separatorIndex < value.length - 1) {
        let key = value.substring(0, separatorIndex);
        let checkpoint = parseInt(value.substring(separatorIndex + 1));

        if(Number.isInteger(checkpoint)) {
          return new QueryETag(key, checkpoint);
        }
      }
    }

    return null;
  }
  
  static tryFromHeader(response) {
    return QueryETag.tryFrom(response.headers.get("ETag"));
  }
}