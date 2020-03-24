//
// Allow configuration of HTTP client
//

let effectiveFetch = fetch;

export default function http(url, options) {
  return effectiveFetch(url, options);
}

http.overrideFetch = function(override) {
  effectiveFetch = override;
};

//
// Some useful builtins
// 

http.get = send("GET");
http.put = send("PUT");
http.post = send("POST");
http.delete = send("DELETE");

function send(method) {
  return (url, options) => {
    return sendCore(url, { ...options, method });
  };
}

async function sendCore(url, options) {
  let { throwOnError } = options;

  delete options.throwOnError;

  let response = await http(url, options);

  if(throwOnError && !response.ok) {
    await throwSendError(response);
  }

  return response;
}

async function throwSendError(response) {
  let message = `Unexpected response: ${response.status} ${response.statusText}`;

  if(response.status >= 500) {
    let body = await response.text();

    if(body) {
      message += "\n\n" + body;
    }
  }

  throw new Error(message);
}

//
// Some useful builtins for JSON
// 

http.getJson = sendJson("GET");
http.putJson = sendJson("PUT");
http.postJson = sendJson("POST");
http.deleteJson = sendJson("DELETE");

function sendJson(method) {
  const jsonType = "application/json; charset=utf-8";

  return (url, options) => {
    options = { ...options, method };

    if(!options.headers) {
      options.headers = {};
    }

    if(options.body) {
      options.headers["Content-Type"] = jsonType;

		  options.body = JSON.stringify(options.body, null, 2);
	  }

	  options.headers["Accept"] = jsonType;

    return sendCore(url, options);
  };
}