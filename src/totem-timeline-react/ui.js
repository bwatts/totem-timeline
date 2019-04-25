import React from "react";
import Timeline from "totem-timeline";

export default function UI(query, TComponent) {
  return class extends React.Component {
    componentWillMount() {
      this.binding = query.bind(
        () => this.props,
        () => this.forceUpdate());
    }

    componentDidMount() {
      this.binding.subscribe();
    }

    componentDidUpdate() {
      this.binding.resubscribeIfArgsChanged();
    }

    componentWillUnmount() {
      this.binding.unsubscribe();
    }

    render() {
      var props = Object.assign({}, this.props, this.binding.data);
      
      return React.createElement(TComponent, props);
    }
  };
};

//
// DOM events
//

UI.onChange = (type, data) => {
  return domEvent => {
    data = data || {};

    data.newValue = domEvent.target.type == "checkbox" ?
      domEvent.target.checked :
      domEvent.target.value;

    Timeline.append(null, type, data);
  };
};

UI.onClick = (type, data) => {
  return domEvent => {
    domEvent.preventDefault();

    Timeline.append(null, type, data);
  };
};

UI.onSubmit = UI.onClick;

//
// Classes
//

UI.classy = (first, second) => {
  let prefix = second ? first : "";
  let flags = second || first;

  let classes = prefix ? [prefix] : [];

  for(let prop in flags) {
    if(flags[prop]) {
      classes.push(toClass(prop));
    }
  }

  return classes.join(" ");
};

function toClass(prop) {
  return prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}