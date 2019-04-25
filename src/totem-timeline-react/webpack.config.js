var path = require("path");
var nodeExternals = require("webpack-node-externals");

module.exports = {
  mode: "development",
  context: path.resolve(__dirname),
  entry: "./ui.js",
  resolve: {
    extensions: [".js"]
  },
  output: {
		path: path.join(__dirname, "dist"),
    filename: "index.js",
    library: "totem-timeline-react",
    libraryTarget: "umd",
    libraryExport: "default"
  },
  target: "node",
  externals: [nodeExternals()],
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: "babel-loader",
        exclude: /node_modules/,
        query: {
          presets: ["env"]
        }
      }
    ]
  }
};