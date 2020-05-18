# Single-file zero-dependency HTML/JS HDF5 Viewer

A bundled browser application with zero external dependencies.  Allows exploring/viewing local HDF5 files from a web browser.

Built using the [jsfive](https://github.com/usnistgov/jsfive) javascript library for HDF5.

To use: download "dist/index.html" from the "dist" branch of this repo.  Open it in your browser (double-click on the file).  Click the button at the bottom of the app to load a local HDF5 file and explore it in tree form.

To contribute/build:

```
git clone git@github.com:bmaranville/hdfviewer
npm install
npm run-script build
```
