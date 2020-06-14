//
// Build a mixin that binds query data to instances of the component
//

export default function QueryData(query, ...props) {
  let binder = createBinder(query, props);
  let bindings = new Map();

  return {
    data() {
      return binder.defaultData();
    },
    created() {
      let binding = binder(this);

      bindings.set(this, binding);

      binding.subscribe();
    },
    updated() {
      bindings.get(this).resubscribeIfArgsChanged();
    },
    beforeDestroy() {
      bindings.get(this).unsubscribe();
      bindings.delete(this);
    },
    watch: {
      $props: {
        deep: true,
        handler() {
          bindings.get(this).resubscribeIfArgsChanged();
        }
      }
    }
  };
}

//
// Build a function that binds query data to a component instance
//

function createBinder(query, props) {
  let defaultData = getDefaultData(query, props);

  function binder(component) {
    let binding = query.bind(component, () => {
      for(let prop in defaultData) {
        component[prop] = binding.data[prop];
      }
    });

    return binding;
  }

  binder.defaultData = function() {
    return { ...defaultData };
  }

  return binder;
}

function getDefaultData(query, props) {
  let defaultData = query.getDefaultData();
  let propsData = {};

  if(props.length === 0) {
    return defaultData;
  }

  for(let prop of props) {
    if(!defaultData.hasOwnProperty(prop)) {
      console.warn(`[Totem warn]: Property "${prop}" is not defined on the query but referenced in the component. Add this property to the query, or remove it from the mixin declaration.`);
    }

    propsData[prop] = defaultData[prop];
  }

  return propsData;
}