import React, { PureComponent } from 'react';

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  TextInput,
  View,
  Linking,
  ScrollView,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';

import { Container, Header, Content, Footer, FooterTab, Text, Button } from 'native-base';

import LocationComponent from '../LocationComponent';

import { NavigationActions } from 'react-navigation';
import { Dropbox } from 'dropbox';
import storage from 'react-native-storage-wrapper';
import NetInfo from '@react-native-community/netinfo';
import Icon from 'react-native-vector-icons/FontAwesome';
import sha1 from 'sha1';
import { Marker, Callout, Polyline, PROVIDER_GOOGLE } from 'react-native-maps'
import MapView from 'react-native-maps-super-cluster';
import RNGooglePlaces from 'react-native-google-places';
import encoding from 'encoding';
import { transliterate as tr } from 'transliteration/src/main/browser';
import { _doGeocode, _getApiToken, _fileReaderAsync, DINFO } from '../../common';
import LegacyKnockPage from '../LegacyKnockPage';
import Modal from 'react-native-simple-dialogs';
import TimeAgo from 'javascript-time-ago'
import pako from 'pako';
import base64 from 'base-64';
import en from 'javascript-time-ago/locale/en'
import t from 'tcomb-form-native';
import _ from 'lodash';
import {geojson2polygons, ingeojson, ucFirst} from 'ourvoiceusa-sdk-js';

TimeAgo.addLocale(en);

var Form = t.form.Form;

var formStreet = t.struct({
  'street': t.String,
});
var formCity = t.struct({
  'multi_unit': t.Boolean,
  'city': t.String,
});
var formState = t.struct({
  'state': t.String,
  'zip': t.String,
});

const formStyleRow = _.cloneDeep(t.form.Form.stylesheet);
formStyleRow.fieldset = {
  flexDirection: 'row'
};
formStyleRow.formGroup.normal.flex = 1;
formStyleRow.formGroup.error.flex = 1;

const formOptRow = {
  stylesheet: formStyleRow,
};

export default class App extends LocationComponent {

  constructor(props) {
    super(props);

    this.state = {
      server: props.navigation.state.params.server,
      last_sync: 0,
      loading: false,
      netInfo: 'none',
      exportRunning: false,
      syncRunning: false,
      serviceError: null,
      deviceError: null,
      locationAccess: null,
      myPosition: {latitude: null, longitude: null},
      region: {latitudeDelta: 0.004, longitudeDelta: 0.004},
      currentNode: null,
      markers: [],
      fAddress: {},
      pAddress: {},
      asyncStorageKey: 'OV_CANVASS_PINS@'+props.navigation.state.params.form.id,
      settingsStorageKey: 'OV_CANVASS_SETTINGS',
      canvassSettings: {},
      DisclosureKey : 'OV_DISCLOUSER',
      isModalVisible: false,
      isKnockMenuVisible: false,
      showDisclosure: "true",
      dbx: props.navigation.state.params.dbx,
      form: props.navigation.state.params.form,
      user: props.navigation.state.params.user,
      geofence: props.navigation.state.params.form.geofence,
      geofencename: props.navigation.state.params.form.geofencename,
    };

    this.myNodes = {};
    this.turfNodes = {};
    this.allNodes = {};

    this.family = {};
    this.fidx = [];

    this.onChange = this.onChange.bind(this);
    this.handleConnectivityChange = this.handleConnectivityChange.bind(this);

    // confirm exit, and reload forms when they do
    this.goBack = this.props.navigation.goBack;
    this.props.navigation.goBack = () => {
      Alert.alert(
        'Exit Canvassing',
        'Are you sure you wish to exit the canvassing?',
        [
          {text: 'Yes', onPress: () => this.goBack()},
          {text: 'No'},
        ], { cancelable: false }
      );
    };
  }

  componentDidMount() {
    DINFO().then(i => this.setState({UniqueID: i.UniqueID})).catch(() => this.setState({deviceError: true}));
    this.requestLocationPermission();
    this.setupConnectionListener();
    this._getCanvassSettings();
    this._getNodesAsyncStorage();
    this.LoadDisclosure(); //Updates showDisclosure state if the user previously accepted
  }

  setupConnectionListener = async () => {
    try {
      let ci = await NetInfo.getConnectionInfo();
      this.handleConnectivityChange(ci);
    } catch (e) {}

    NetInfo.addEventListener(
     'connectionChange',
     this.handleConnectivityChange
    );
  }

  handleConnectivityChange(ci) {
    let state = 'none';
    try {
      switch (ci.type) {
        case 'wifi':
        case 'bluetooth':
        case 'ethernet':
          state = 'wifi';
          // TODO: this doesn't trigger a sync when you first open the app, only because settings aren't loaded yet
          //       need more rubost state change logic
          if (this.state.canvassSettings.auto_sync && !this.state.syncRunning) this._syncNodes(false);
          break;
        case 'cellular':
        case 'wimax':
          state = 'cellular';
          break;
      }
    } catch (e) {}
    this.setState({netInfo: state});
  }

  _syncable() {
    if (this.state.dbx) return true;
    return (this.state.server?true:false);
  }

  syncingOk() {
    if (this.state.netInfo === 'none') return false;
    if (this.state.canvassSettings.sync_on_cellular !== true && this.state.netInfo !== 'wifi') return false;
    return true;
  }

  componentWillUnmount() {
    this.cleanupLocation();
    NetInfo.removeEventListener(
      'connectionChange',
      this.handleConnectivityChange
    );
  }

  showConfirmAddress(pos) {
    const { myPosition } = this.state;

    if (!pos) pos = myPosition;

    if (this.state.netInfo === 'none') {
      this.setState({ isModalVisible: true });
      return;
    }

    if (pos.latitude !== null && pos.longitude !== null) {
      if (this.state.geofence && !ingeojson(this.state.geofence, pos.longitude, pos.latitude)) {
        Alert.alert('Outside District', 'You are outside the district boundary for this canvassing form. You need to be within the boundaries of '+this.state.geofencename+'.', [{text: 'OK'}], { cancelable: false });
        return;
      }
    }

    this.setState({
      loading: true,
      isModalVisible: true,
    });

    setTimeout(async () => {
      try {
        if (this.state.locationAccess === false) throw "location access denied";

        let res = await _doGeocode(pos.longitude, pos.latitude);

        if (!res.error) {
          let arr = res.address.split(", ");
          let country = arr[arr.length-1]; // unused
          let state_zip = arr[arr.length-2];
          let fAddress = {
            state: (state_zip?state_zip.split(" ")[0]:null),
            zip: (state_zip?state_zip.split(" ")[1]:null),
            city: arr[arr.length-3],
            street: arr[arr.length-4],
            longitude: pos.longitude,
            latitude: pos.latitude,
          };

          this.setState({fAddress});
        }
      } catch (error) {}
      this.setState({loading: false})
    }, 550);
  }

  onChange(fAddress) {
    this.setState({fAddress});
  }

  getEpoch() {
    return Math.floor(new Date().getTime())
  }

  doConfirmAddress = async () => {
    const { myPosition, form } = this.state;
    let { fAddress } = this.state;

    let jsonStreet = this.refs.formStreet.getValue();
    let jsonCity = this.refs.formCity.getValue();
    let jsonState = this.refs.formState.getValue();

    if (jsonStreet === null || jsonCity === null || jsonState === null) return;

    try {
      await this.map.getMapRef().animateToCoordinate({longitude: fAddress.longitude, latitude: fAddress.latitude}, 500)
    } catch (error) {}

    let epoch = this.getEpoch();

    fAddress.street = jsonStreet.street.trim();
    fAddress.multi_unit = jsonCity.multi_unit;
    fAddress.city = jsonCity.city.trim();
    fAddress.state = jsonState.state.trim();
    fAddress.zip = jsonState.zip.trim();

    let address = [fAddress.street, fAddress.city, fAddress.state, fAddress.zip];
    let node = {
      type: "address",
      id: sha1(JSON.stringify(address)),
      latlng: {latitude: fAddress.latitude, longitude: fAddress.longitude},
      address: address,
      multi_unit: jsonCity.multi_unit,
    };

    node = await this._addNode(node);

    this.setState({ fAddress: fAddress, pAddress: fAddress, isModalVisible: false });
    this.doMarkerPress(node);
  }

  doMarkerPress(node) {
    const { navigate } = this.props.navigation;

    this.setState({currentNode: node});

    if (node.multi_unit === true)
      navigate('LegacyListMultiUnit', {refer: this, node: node});
    else
      this.setState({isKnockMenuVisible: true});
  }

  _addNode(node) {
    let epoch = this.getEpoch();

    node.updated = epoch;
    node.canvasser = (this.state.dbx ? this.state.user.dropbox.name.display_name : 'You');
    if (!node.id) node.id = sha1(epoch+JSON.stringify(node)+this.state.currentNode.id);

    let dupe = this.getNodeById(node.id);
    if (!dupe.id) node.created = epoch;
    else {
      // prevent overwriting latlng info with null
      if (dupe.latlng && (node.latlng.latitude === null || node.latlng.longitude === null))
        node.latlng = dupe.latlng;
    }

    this.myNodes[node.id] = node;
    this.allNodes[node.id] = node;

    this._saveNodes(this.myNodes);

    return node;
  }

  getLastInteraction(id) {
    let nodes = this.getChildNodesByIdTypes(id, ["survey", "import"]);
    const timeAgo = new TimeAgo('en-US')
    let str;

    if (nodes.length)  {
      let last = nodes[0];
      if (last.type === "survey") {
        // App was released in early 2018 with timestamps in seconds
        // If the timestamp is earlier than that, assume it's in seconds and convert to milliseconds
        if (last.updated < 1514764801000) last.updated *= 1000;
        str = ucFirst(last.status)+' '+timeAgo.format(new Date(last.updated));
      }
      else
        str = "Haven't visited";
    } else {
      str = "Haven't visited";
    }

    return str;
  }

  getLatestSurveyInfo(id) {
    let nodes = this.getChildNodesByIdTypes(id, ["survey", "import"]);

    for (let n in nodes) {
      let node = nodes[n];
      if (node.survey) return node.survey;
    }

    return {};
  }

  LoadDisclosure = async () => {
    try {
      const value = await storage.get(this.state.DisclosureKey);
      if (value !== null) {
        this.setState({showDisclosure : value});
      }
    } catch (error) {}
  }

  SaveDisclosure = async () => {
    try {
      await storage.set(this.state.DisclosureKey, "false");
    } catch (error) {}
  }

  _nodesFromJtxt(str) {
    let store;

    try {
      store = JSON.parse(pako.ungzip(base64.decode(str), { to: 'string' }));
    } catch (e) {
      try {
        store = JSON.parse(str);
      } catch (e) {
        return {};
      }
    }

    if (!store.nodes) store.nodes = {};

    // check for old version 1 format and convert
    if (store.pins) {
      for (let p in store.pins) {
        let pin = store.pins[p];

        // address had "unit" in it - splice it out
        let unit = pin.address.splice(1, 1);
        // "city" started with a space... a bug
        pin.address[1] = pin.address[1].trim();

        // ensure latlng aren't strings
        if (pin.latlng) {
          pin.latlng.longitude = parseFloat(pin.latlng.longitude);
          pin.latlng.latitude = parseFloat(pin.latlng.latitude);
        }

        let id = sha1(JSON.stringify(pin.address));
        let pid = id;

        if (!store.nodes[id]) {
          store.nodes[id] = {
            type: "address",
            id: id,
            created: pin.id,
            updated: pin.id,
            canvasser: store.canvasser,
            latlng: pin.latlng,
            address: pin.address,
            multi_unit: ((unit && unit[0] !== null && unit[0] !== "")?true:false),
          };
        }

        if (unit && unit[0] !== null && unit[0] !== "") {
          id = sha1(pid+unit[0]);
          store.nodes[id] = {
            type: "unit",
            id: id,
            parent_id: pid,
            created: pin.id,
            updated: pin.id,
            canvasser: store.canvasser,
            unit: unit[0],
          };
        }

        let status = '';
        switch (pin.color) {
          case 'green': status = 'home'; break;
          case 'yellow': status = 'not home'; break;
          case 'red': status = 'not interested'; break;
        }

        let survey_id = sha1(id+JSON.stringify(pin.survey)+pin.id);

        store.nodes[survey_id] = {
          type: "survey",
          id: survey_id,
          parent_id: id,
          created: pin.id,
          updated: pin.id,
          canvasser: store.canvasser,
          status: status,
          survey: pin.survey,
        };
      }

    }

    return store.nodes;
  }

  _getNodesAsyncStorage = async () => {
    try {
      const value = await storage.get(this.state.asyncStorageKey);
      if (value !== null) {
        this.myNodes = this._nodesFromJtxt(value);
        this.allNodes = this.myNodes;
      }
    } catch (e) {}

    this.updateMarkers();

    // even if sycn isn't OK over cellular - do the initial sync anyway
    if (this._syncable()) await this._syncNodes(false);

  }

  updateMarkers() {
    let nodes = [];
    let nodeList;

    if (this.state.canvassSettings.show_only_my_turf === true)
      nodeList = this.mergeNodes([this.turfNodes, this.myNodes]);
    else
      nodeList = this.mergeNodes([this.allNodes]);

    for (let n in nodeList) {
      let node = nodeList[n];
      if (node.type === "address" && node.latlng
        && !Number.isNaN(node.latlng.longitude) && !Number.isNaN(node.latlng.latitude)) {
        node.location = node.latlng; // supercluster expects latlng to be "location"
        nodes.push(node);
      }
    }

    this.setState({markers: nodes});
  }

  nodeHasSurvey(node) {
    let children = this.getChildNodesByIdTypes(node.id, ["survey"]);
    if (children.length === 0) return false;
    return true;
  }

  _getCanvassSettings = async () => {
    let canvassSettings = {};
    try {
      const value = await storage.get(this.state.settingsStorageKey);
      if (value !== null) {
        canvassSettings = JSON.parse(value);
        this.setState({ canvassSettings });
      }
    } catch (e) {
      // don't continue with the below questions on storage fetch error
      return;
    }

    if (!this._syncable()) return;

    if (canvassSettings.sync_on_cellular !== true && canvassSettings.asked_sync_on_cellular !== true)
      this.alertPush({
        title: 'Sync over cellular',
        description: 'Would you like to enable syncing of your data over your cellular connection?',
        funcs: [
          {text: 'Yes', onPress: async () => {
            let { canvassSettings } = this.state;
            canvassSettings.asked_sync_on_cellular = true;
            canvassSettings.sync_on_cellular = true;
            await this._setCanvassSettings(canvassSettings);
            this.alertFinish();
          }},
          {text: 'No', onPress: async () => {
            let { canvassSettings } = this.state;
            canvassSettings.asked_sync_on_cellular = true;
            await this._setCanvassSettings(canvassSettings);
            this.alertFinish();
          }},
        ]
      });

    if (canvassSettings.auto_sync !== true && canvassSettings.asked_auto_sync !== true)
      this.alertPush({
        title: 'Automatially sync data',
        description: 'Would you like your data to automatically sync as you canvass, if a data connection is available?',
        funcs: [
          {text: 'Yes', onPress: async () => {
            let { canvassSettings } = this.state;
            canvassSettings.asked_auto_sync = true;
            canvassSettings.auto_sync = true;
            await this._setCanvassSettings(canvassSettings);
          }},
          {text: 'No', onPress: async () => {
            let { canvassSettings } = this.state;
            canvassSettings.asked_auto_sync = true;
            await this._setCanvassSettings(canvassSettings);
          }},
        ]
      });

  }

  _setCanvassSettings = async (canvassSettings) => {
    const { form, dbx } = this.state;

    let rmshare = false;

    if (this.state.canvassSettings.share_progress !== canvassSettings.share_progress && canvassSettings.share_progress === false) rmshare = true;

    try {
      let str = JSON.stringify(canvassSettings);
      await storage.set(this.state.settingsStorageKey, str);
      this.setState({canvassSettings});
    } catch (e) {}

    if (rmshare) {
      try {
        let res = await dbx.filesListFolder({path: form.folder_path});
        for (let i in res.entries) {
          item = res.entries[i];
          if (item['.tag'] != 'folder') continue;
          if (item.path_display.match(/@/))
            await dbx.filesDelete({ path: item.path_display+'/exported.jtrf' });
        }
      } catch (e) {}
    }

    this.updateMarkers();
  }

  timeFormat(epoch) {
    let date = new Date(epoch);
    return date.toLocaleDateString('en-us')+" "+date.toLocaleTimeString('en-us');
  }

  _nodesToJtxt(nodes) {
    return base64.encode(pako.gzip(JSON.stringify({
      formId: this.state.form.id,
      nodes: nodes,
    }), { to: 'string' }));
  }

  _saveNodes = async (nodes) => {
    this.myNodes = nodes;

    try {
      await storage.set(this.state.asyncStorageKey, this._nodesToJtxt(nodes));
    } catch (error) {
      console.warn(error);
    }

    this.updateMarkers();

    if (this.state.canvassSettings.auto_sync && this.syncingOk() && !this.state.syncRunning) this._syncNodes(false);
  }

  mergeNodes(stores, time) {
    let nodes = {};

    for (let s in stores) {
      let store = stores[s];
      for (let n in store) {
        let node = store[n];
        if (!nodes[node.id]) nodes[node.id] = node;
        else {
          if (node.updated > nodes[node.id].updated) nodes[node.id] = node;
        }
        if (nodes[node.id].parent_id) {
          if (!this.family[nodes[node.id].parent_id])
            this.family[nodes[node.id].parent_id] = [];

          if (this.fidx.indexOf(node.id) === -1) {
            this.fidx.push(node.id);
            this.family[nodes[node.id].parent_id].push(node);
          }
        }
      }
    }

    // if given a time, sort out everything older than it
    if (time) for (let n in nodes) if (nodes[n].updated < time) delete nodes[n];

    // sort everything in family
    for (let f in this.family) {
      this.family[f] = this.family[f].sort(this.dynamicSort("updated"));
    }

    return nodes;
  }

  _syncNodes = async (flag) => {
    let ret;

    if (this.state.syncRunning === true) return;

    this.setState({syncRunning: true});

    if (this.state.server) ret = await this._syncServer();
    else ret = await this._syncDropbox();

    this.setState({syncRunning: false});
    this.updateMarkers();

    if (flag) {
      if (ret.error) {
        Alert.alert('Error', 'Unable to sync with the server'+(ret.msg?': '+ret.msg:'.'), [{text: 'OK'}], { cancelable: false });
      } else {
        Alert.alert('Success', 'Data sync successful!', [{text: 'OK'}], { cancelable: false });
      }
    }

  }

  _syncServer = async () => {
    let ret = {error: false};

    let store = {
      formId: this.state.form.id,
      last_sync: this.state.last_sync,
      nodes: this.mergeNodes([this.myNodes], this.state.last_sync)
    };

    try {
      let res = await fetch('https://'+this.state.server+'/canvass/v1/sync', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer '+await _getApiToken(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(store)
      });

      let json = await res.json();

      if (res.status !== 200 || json.error === true) {
        if (json.msg) ret.msg = json.msg;
        throw "Sync error";
      }

      this.allNodes = this.mergeNodes([this.allNodes,this.myNodes,json.nodes]);
      this.setState({last_sync: new Date().getTime()});
    } catch (e) {
      ret.error = true;
      console.warn('error: '+e);
    }

    return ret;
  }

  _syncDropbox = async () => {
    let { dbx, form, user, UniqueID } = this.state;
    let folders = [];
    let allsrc = [this.allNodes];
    let ret = {error: false};

    try {
      // download other jtxt files on this account
      let res = await dbx.filesListFolder({path: form.folder_path});
      if (res.entries.length === 0) throw "The form's folder is missing!";

      for (let i in res.entries) {
        let item = res.entries[i];
        if (item['.tag'] === 'folder') folders.push(item.path_display);
        if (item.path_display.match(/\.jtxt$/) && !item.path_display.match(UniqueID)) {
          try {
            let data = await dbx.filesDownload({ path: item.path_display });
            allsrc.push(this._nodesFromJtxt(await _fileReaderAsync(data.fileBlob)));
          } catch (e) {}
        }
      }

      // download "turf" for this device
      try {
        let data = await dbx.filesDownload({ path: form.folder_path+'/'+UniqueID+'.jtrf' });
        this.turfNodes = this._nodesFromJtxt(await _fileReaderAsync(data.fileBlob));
        allsrc.push(this.turfNodes);
      } catch (e) {}

      // download exported "turf" for this account
      try {
        let data = await dbx.filesDownload({ path: form.folder_path+'/exported.jtrf' });
        allsrc.push(this._nodesFromJtxt(await _fileReaderAsync(data.fileBlob)));
      } catch (e) {}

      await dbx.filesUpload({ path: form.folder_path+'/'+UniqueID+'.jtxt', contents: encoding.convert(tr(this._nodesToJtxt(this.myNodes)), 'ISO-8859-1'), mute: true, mode: {'.tag': 'overwrite'} });
      allsrc.push(this.myNodes);

      // extra sync stuff for the form owner
      if (user.dropbox.account_id == form.author_id) {
        // download all sub-folder .jtxt files
        // TODO: do in paralell... let objs = await Promise.all(pro.map(p => p.catch(e => e)));
        for (let f in folders) {
          try {
            let res = await dbx.filesListFolder({path: folders[f]});
            for (let i in res.entries) {
              let item = res.entries[i];
              if (item.path_display.match(/\.jtxt$/)) {
                let data = await dbx.filesDownload({ path: item.path_display });
                allsrc.push(this._nodesFromJtxt(await _fileReaderAsync(data.fileBlob)));
              }
            }
          } catch (e) {
            console.warn(e);
          }
        }

        let exportedFile = encoding.convert(tr(this._nodesToJtxt(this.mergeNodes(allsrc))), 'ISO-8859-1');
        await dbx.filesUpload({ path: form.folder_path+'/exported.jtrf', contents: exportedFile, mute: true, mode: {'.tag': 'overwrite'} });

        // copy exported.jtrf to all sub-folders if configured in settings
        if (this.state.canvassSettings.share_progress === true) {
          for (let f in folders) {
            let folder = folders[f];
            if (folder.match(/@/)) {
              try {
                await dbx.filesUpload({ path: folder+'/exported.jtrf', contents: exportedFile, mute: true, mode: {'.tag': 'overwrite'} });
              } catch (e) {
                console.warn(e);
              }
            }
          }
        }
      }

    } catch (e) {
      ret.error = true;
    }

    this.allNodes = this.mergeNodes(allsrc);

    return ret;
  }

  getNodeById(id) {
    return (this.allNodes[id] ? this.allNodes[id] : {});
  }

  updateNodeById = async (id, prop, value) => {
    let node = this.getNodeById(id);

    if (!node.id) return;

    node[prop] = value;
    node.updated = this.getEpoch();

    this.myNodes[id] = node;
    this.allNodes[id] = node;

    await this._saveNodes(this.myNodes);
  }

  getChildNodesByIdTypes(id, types) {
    let nodes = [];

    if (!this.family[id]) return nodes;

    for (let c in this.family[id]) {
      let node = this.family[id][c];
      if (types.indexOf(node.type) !== -1) {
        nodes.unshift(node);
      }
    }

    return nodes;
  }

  dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
      var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
      return result * sortOrder;
    }
  }

  getPinColor(node) {
    if (node.multi_unit) return "cyan";

    nodes = this.getChildNodesByIdTypes(node.id, ["survey"]);

    // no interactions
    if (nodes.length === 0) return "#8b4513";

    switch (nodes[0].status) {
      case 'home': return "green";
      case 'not home': return "yellow";
      case 'not interested': return "red";
    }

    return "#8b4513";
  }

  getLastStatus(node) {
    if (node.multi_unit) return "multi-unit";

    nodes = this.getChildNodesByIdTypes(node.id, ["survey"]);

    // no interactions
    if (nodes.length === 0) return "not visited";

    switch (nodes[0].status) {
      case 'home':
      case 'not home':
      case 'not interested':
        return nodes[0].status;
    }

    return "not visited";
  }

  doExport = async (refer) => {
    let { dbx, form } = this.state;

    refer.setState({exportRunning: true});
    let success = false;

    try {
      await this._syncNodes(false);

      // convert to .csv file and upload
      let keys = Object.keys(form.questions);
      let csv = "Street,City,State,Zip,Unit,longitude,latitude,canvasser,datetime,status,"+keys.join(",")+"\n";

      for (let a in this.allNodes) {
        let node = this.allNodes[a];
        if (node.type !== "survey") continue;

        let addr = this.getNodeById(node.parent_id);

        // orphaned survey
        if (!addr.id) continue

        // unit
        let unit = {};
        if (addr.type === "unit") {
          unit = addr;
          addr = this.getNodeById(addr.parent_id);
        }

        if (this.state.canvassSettings.only_export_home === true && node.status !== 'home') continue;

        csv += (addr.address?addr.address.map((x) => '"'+(x?x:'')+'"').join(','):'')+
          ","+(unit.unit?unit.unit:'')+
          ","+(addr.latlng?addr.latlng.longitude:'')+
          ","+(addr.latlng?addr.latlng.latitude:'')+
          ","+node.canvasser+
          ","+this.timeFormat(node.updated)+
          ","+node.status;
        for (let key in keys) {
          let value = '';
          if (node.survey && node.survey[keys[key]]) value = node.survey[keys[key]];
          csv += ',"'+value+'"';
        }
        csv += "\n";
      }

      // csv file
      await dbx.filesUpload({ path: form.folder_path+'/'+form.name+'.csv', contents: encoding.convert(tr(csv), 'ISO-8859-1'), mute: false, mode: {'.tag': 'overwrite'} });
      success = true;
    } catch(e) {
      console.warn(e);
    }

    refer.setState({ exportRunning: false }, refer.exportDone(success));
  }

  _canvassGuidelinesUrlHandler() {
    const url = "https://github.com/OurVoiceUSA/HelloVoter/blob/master/docs/Canvassing-Guidelines.md";
    return Linking.openURL(url).catch(() => null);
  }

  renderMarker = (marker) => {
    let status = {
        home: 0, 'not home': 0, 'not interested': 0, 'not visited': 0,
    };

    if (marker.multi_unit) {
      let units = this.getChildNodesByIdTypes(marker.id, ["unit"]);
      for (let u in units) {
        let stat = this.getLastStatus(units[u]);
        status[stat]++;
      }
    }

    return (
      <Marker
        key={marker.id}
        coordinate={marker.latlng}
        //image={(marker.landmark?require("../../../img/spacexfh.png"):null)}
        draggable={(marker.image?false:this.state.canvassSettings.draggable_pins)}
        onDragEnd={(e) => {
          this.updateNodeById(marker.id, 'latlng', e.nativeEvent.coordinate);
        }}
        pinColor={this.getPinColor(marker)}>
        <Callout onPress={() => {
          //if (!marker.landmark)
          this.doMarkerPress(marker);
        }}>
          <View style={{backgroundColor: '#FFFFFF', padding: 5, width: 175}}>
            <Text style={{fontWeight: 'bold'}}>{marker.address.join("\n")}</Text>
            <Text>{(marker.multi_unit ? 'Multi-unit address' : this.getLastInteraction(marker.id))}</Text>
            {marker.multi_unit &&
              <View style={{flex: 1, flexDirection: 'row'}}>
                <View style={{marginRight: 5}}>
                  <Text style={{fontSize: 13}}>Home:</Text>
                  <Text style={{fontSize: 13}}>Not Home:</Text>
                  <Text style={{fontSize: 13}}>Not Interested:</Text>
                  <Text style={{fontSize: 13}}>Not Visited:</Text>
                </View>
                <View style={{marginRight: 5}}>
                  <Text style={{fontSize: 13}}>{status['home']}</Text>
                  <Text style={{fontSize: 13}}>{status['not home']}</Text>
                  <Text style={{fontSize: 13}}>{status['not interested']}</Text>
                  <Text style={{fontSize: 13}}>{status['not visited']}</Text>
                </View>
              </View>
            }
          </View>
        </Callout>
      </Marker>
    );
  }

  renderCluster = (cluster, onPress) => {
    const pointCount = cluster.pointCount,
      coordinate = cluster.coordinate,
      clusterId = cluster.clusterId;

    const clusteringEngine = this.map.getClusteringEngine(),
      leaves = clusteringEngine.getLeaves(clusterId, Infinity);

    let status = {
      house: {
        home: 0, 'not home': 0, 'not interested': 0, 'not visited': 0,
      },
      'multi-unit': {
        home: 0, 'not home': 0, 'not interested': 0, 'not visited': 0,
      }
    };

    for (let l in leaves) {
      let node = leaves[l].properties.item;
      if (node.multi_unit) {
        let units = this.getChildNodesByIdTypes(node.id, ["unit"]);
        for (let u in units) {
          let stat = this.getLastStatus(units[u]);
          status['multi-unit'][stat]++;
        }
      } else {
        let stat = this.getLastStatus(node);
        status['house'][stat]++;
      }
    }

    const size = 25 + ((pointCount+"").length*5);

    return (
      <Marker key={clusterId} coordinate={coordinate}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={{
            backgroundColor: '#ffffff', width: size, height: size, borderRadius: size,
            borderWidth: 1, borderColor: '#000000',
            alignItems: 'center', justifyContent: 'center', margin: 2.5,
            }}>
            <Text>{pointCount}</Text>
          </TouchableOpacity>
        </View>
        <Callout>
          <View style={{backgroundColor: '#FFFFFF', padding: 5, width: 225}}>
            <View style={{flex: 1, alignItems: 'center'}}>
              <View style={{flex: 1, flexDirection: 'row'}}>
                <View style={{marginRight: 5}}>
                  <Text style={{fontSize: 13, textDecorationLine: 'underline'}}>Status</Text>
                  <Text style={{fontSize: 13}}>Home:</Text>
                  <Text style={{fontSize: 13}}>Not Home:</Text>
                  <Text style={{fontSize: 13}}>Not Interested:</Text>
                  <Text style={{fontSize: 13}}>Not Visited:</Text>
                </View>
                <View style={{marginRight: 5}}>
                  <Text style={{fontSize: 13, textDecorationLine: 'underline'}}>House</Text>
                  <Text style={{fontSize: 13}}>{status['house']['home']}</Text>
                  <Text style={{fontSize: 13}}>{status['house']['not home']}</Text>
                  <Text style={{fontSize: 13}}>{status['house']['not interested']}</Text>
                  <Text style={{fontSize: 13}}>{status['house']['not visited']}</Text>
                </View>
                <View>
                  <Text style={{fontSize: 13, textDecorationLine: 'underline'}}>Multi-Unit</Text>
                  <Text style={{fontSize: 13}}>{status['multi-unit']['home']}</Text>
                  <Text style={{fontSize: 13}}>{status['multi-unit']['not home']}</Text>
                  <Text style={{fontSize: 13}}>{status['multi-unit']['not interested']}</Text>
                  <Text style={{fontSize: 13}}>{status['multi-unit']['not visited']}</Text>
                </View>
              </View>
            </View>
          </View>
        </Callout>
      </Marker>
    )
  }

  render() {
    const { navigate } = this.props.navigation;
    const {
      showDisclosure, myPosition, myNodes, locationAccess, serviceError, deviceError,
      form, user, fAddress, loading, dbx, region, UniqueID,
    } = this.state;

    if (showDisclosure === "true") {
      return (
        <ScrollView style={{flex: 1, backgroundColor: 'white'}}>
          <View style={styles.content}>
            <Text style={{margin: 15, fontSize: 18, color: 'dimgray'}}>
              Our Voice provides this canvassing tool for free for you to use for your own purposes. You will be talking
              to real people and asking real questions about policy positions that matter, and hopefully also collaborating
              with other canvassers. Together, we can crowd source the answers to how our country thinks outside of
              partisan politics.
            </Text>

            <View style={{margin: 15}}>
              <Text style={{fontSize: 18, color: 'dimgray'}}>
                By using this tool you acknowledge that you are acting on your own behalf, do not represent Our Voice USA
                or its affiliates, and have read our <Text style={{fontSize: 18, fontWeight: 'bold', color: 'blue'}} onPress={() => {this._canvassGuidelinesUrlHandler()}}>
                canvassing guidelines</Text>. Please be courteous to those you meet.
              </Text>
            </View>

                <View style={{margin: 5, flexDirection: 'row'}}>
                  <Icon.Button
                    name="check-circle"
                    backgroundColor="#d7d7d7"
                    color="#000000"
                    onPress={() => {
                      this.setState({ showDisclosure: "false"}); //Hide disclosure
                      this.SaveDisclosure(); //Save the disclosures acceptance
                    }}
                    {...iconStyles}>
                    I understand & agree to the guidelines
                  </Icon.Button>
                </View>

                <View style={{margin: 5, flexDirection: 'row'}}>
                  <Icon.Button
                    name="ban"
                    backgroundColor="#d7d7d7"
                    color="#000000"
                    onPress={() => {this.props.navigation.dispatch(NavigationActions.back())}}
                    {...iconStyles}>
                    I do not agree to this! Take me back!
                  </Icon.Button>
                </View>

          </View>
        </ScrollView>
      );
    }

    var nomap_content = [];

    if (locationAccess === false) {
      nomap_content.push(
        <View key={1} style={styles.content}>
          <Text>Unable to determine your location.</Text>
          <Text>To view the map, enable location permissions in your device settings.</Text>
        </View>
      );
    } else if (serviceError === true) {
      nomap_content.push(
        <View key={1} style={styles.content}>
          <Text>Unable to load location services from your device.</Text>
        </View>
      );
    } else if (deviceError === true) {
      nomap_content.push(
        <View key={1} style={styles.content}>
          <Text>Device Error.</Text>
        </View>
      );
    } else if (myPosition.latitude === null || myPosition.longitude === null) {
      nomap_content.push(
        <View key={1} style={styles.content}>
          <Text>Waiting on location data from your device...</Text>
          <ActivityIndicator />
        </View>
      );
    }

/*
    // TODO: onRegionChangeComplete() to update region lags supercluster real bad,
             so omitting this for now
    let landmarks = [];

    if (region.longitudeDelta < 0.035) landmarks = [{
      id: "spacex",
      landmark: true,
      image: "../../../img/spacexfh.png",
      latlng: { latitude: 33.9208231, longitude: -118.3281370 },
      location: { latitude: 33.9208231, longitude: -118.3281370 },
      address: ["1 Rocket Road", "Hawthorne", "CA", "90250"],
    }];
*/

    let geofence = [];
    if (this.state.geofence) {
      geofence = geojson2polygons(this.state.geofence, true);
    }

    let maxZoom = 15; // high (default)

    switch (this.state.canvassSettings.pin_clustering_zoom) {
      case 'medium': maxZoom = 14; break;
      case 'low': maxZoom = 13; break;
    }

    return (
      <View style={{flex: 1}}>

        <View style={{flex: 1}}></View>

        {nomap_content.length &&
          <View>
            { nomap_content }
          </View>
        ||
        <MapView
          ref={component => this.map = component}
          initialRegion={{latitude: myPosition.latitude, longitude: myPosition.longitude, latitudeDelta: region.latitudeDelta, longitudeDelta: region.longitudeDelta}}
          onMapReady={() => {
            let latitudeDelta = region.latitudeDelta;
            let longitudeDelta = region.longitudeDelta;

            switch (this.state.canvassSettings.pin_clustering_zoom) {
              case "medium":
                latitudeDelta = 0.0075;
                longitudeDelta = 0.0075;
                break;
              case "low":
                latitudeDelta = 0.015;
                longitudeDelta = 0.015;
                break;
            }

            this.map.getMapRef().animateToRegion({
              latitude: myPosition.latitude,
              longitude: myPosition.longitude,
              latitudeDelta: latitudeDelta,
              longitudeDelta: longitudeDelta,
            });
          }}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation={true}
          followsUserLocation={false}
          keyboardShouldPersistTaps={true}
          data={this.state.markers}
          renderMarker={this.renderMarker}
          renderCluster={this.renderCluster}
          radius={50}
          minZoom={0}
          maxZoom={maxZoom}
          {...this.props}>
          {geofence.map((polygon, idx) => <Polyline key={idx} coordinates={polygon} strokeWidth={2} />)}
        </MapView>
        }

        <View style={{alignItems: 'center', justifyContent: 'flex-end'}}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.iconContainer}
            onPress={() => {this.showConfirmAddress();}}>
            <Icon
              name="map-marker"
              testID="map-marker"
              size={50}
              color="#8b4513"
              {...iconStyles} />
          </TouchableOpacity>

          {nomap_content.length == 0 &&
          <TouchableOpacity style={styles.iconContainer}
            onPress={() => this.map.getMapRef().animateToCoordinate(myPosition, 1000)}>
            <Icon
              name="location-arrow"
              size={50}
              color="#0084b4"
              {...iconStyles} />
          </TouchableOpacity>
          }

          {nomap_content.length == 0 &&
          <TouchableOpacity style={styles.iconContainer}
            onPress={() => {
              RNGooglePlaces.openAutocompleteModal(
                {
                  locationBias: {
                    latitudeNE: myPosition.latitude+0.1,
                    longitudeNE: myPosition.longitude+0.1,
                    latitudeSW: myPosition.latitude-0.1,
                    longitudeSW: myPosition.longitude-0.1,
                  }
                },
                ['location','address']
              ).then((place) => {
                this.map.getMapRef().animateToCoordinate(place.location, 1000);
                this.showConfirmAddress(place.location);
              })
              .catch(e => {});
            }}>
            <Icon
              name="search"
              size={40}
              color="#000000"
              {...iconStyles} />
          </TouchableOpacity>
          }
        </View>
        </View>

        <Modal
          open={this.state.isModalVisible}
          modalStyle={{width: 350, height: 400, backgroundColor: "transparent",
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
          style={{alignItems: 'center'}}
          offset={0}
          overlayBackground={'rgba(0, 0, 0, 0.75)'}
          animationDuration={200}
          animationTension={40}
          modalDidOpen={() => undefined}
          modalDidClose={() => this.setState({isModalVisible: false})}
          closeOnTouchOutside={true}
          disableOnBackPress={false}>
          <View style={{flexDirection: 'column'}}>
            <View style={{width: 325, backgroundColor: 'white', marginTop: 5, borderRadius: 15, padding: 10, alignSelf: 'flex-start'}}>
              {loading &&
              <View>
                <Text style={{color: 'blue', fontWeight: 'bold', fontSize: 15}}>Loading Address</Text>
                <ActivityIndicator size="large" />
              </View>
              ||
              <View>
                <View style={{flexDirection: 'row'}}>
                  <Text style={{color: 'blue', fontWeight: 'bold', fontSize: 15}}>Confirm the Address</Text>
                  <View style={{flexDirection: 'row'}}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#d7d7d7', padding: 10, borderRadius: 20, marginLeft: 5,
                        ...((this.state.pAddress.street && this.state.pAddress.street !== this.state.fAddress.street) ? {} : displayNone)
                      }}
                      onPress={() => {this.setState({fAddress: this.state.pAddress})}}>
                      <Text style={{textAlign: 'center'}}>Use Previous</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#d7d7d7', padding: 10, borderRadius: 20, marginLeft: 5,
                        ...(this.state.netInfo === 'none' ? displayNone : {})
                      }}
                      onPress={() => {this.showConfirmAddress();}}>
                      <Text style={{textAlign: 'center'}}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Form
                 ref="formStreet"
                 type={formStreet}
                 onChange={this.onChange}
                 value={fAddress}
                />
                <Form
                 ref="formCity"
                 type={formCity}
                 onChange={this.onChange}
                 options={formOptRow}
                 value={fAddress}
                />
                <Form
                 ref="formState"
                 type={formState}
                 onChange={this.onChange}
                 options={formOptRow}
                 value={fAddress}
                />
                <TouchableHighlight style={styles.addButton} onPress={this.doConfirmAddress} underlayColor='#99d9f4'>
                  <Text style={styles.buttonText}>Add</Text>
                </TouchableHighlight>
              </View>
              }
            </View>
          </View>
        </Modal>

        <Modal
          open={this.state.isKnockMenuVisible}
          modalStyle={{width: 335, height: 350, backgroundColor: "transparent",
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
          style={{alignItems: 'center'}}
          offset={0}
          overlayBackground={'rgba(0, 0, 0, 0.75)'}
          animationDuration={200}
          animationTension={40}
          modalDidOpen={() => undefined}
          modalDidClose={() => this.setState({isKnockMenuVisible: false})}
          closeOnTouchOutside={true}
          disableOnBackPress={false}>
          <LegacyKnockPage refer={this} funcs={this} />
        </Modal>

        <BottomNavigation active={(this.state.syncRunning?'sync':'none')} hidden={false} >
          {this._syncable()&&
          <BottomNavigation.Action
            key="sync"
            icon={(this.state.syncRunning?'more-vert':'refresh')}
            label={(this.state.syncRunning?'Syncing...':'Sync Data')}
            onPress={() => {
              if (this.state.netInfo === 'none') {
                Alert.alert('Sync failed.', 'You are not connected to the internet.', [{text: 'OK'}], { cancelable: false });
              } else if (!this.syncingOk()) {                                                                                                                            Alert.alert('Sync failed.', 'You are not connected to wifi. To sync over your cellular connection, enable \'Sync over cellular\' in settings.', [{text: 'OK'}], { cancelable: false });
              } else {
                this._syncNodes(true);
              }
            }}
          />
          ||
          <BottomNavigation.Action
            key="none"
            icon="map"
            label="Map View"
          />
          }
          <BottomNavigation.Action
            key="settings"
            icon="settings"
            label="Settings"
            onPress={() => navigate("LegacyCanvassingSettingsPage", {refer: this, UniqueID: UniqueID})}
          />
        </BottomNavigation>

      </View>
    );
  }
}

const iconStyles = {
  justifyContent: 'center',
  borderRadius: 10,
  padding: 10,
};

const displayNone = {
  height: 0,
  maxHeight: 0,
  opacity: 0,
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: '#ffffff', width: 65, height: 65, borderRadius: 65,
    borderWidth: 2, borderColor: '#000000',
    alignItems: 'center', justifyContent: 'center', margin: 2.5,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  bubble: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
  },
  latlng: {
    width: 200,
    alignItems: 'stretch',
  },
  button: {
    width: 300,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
    backgroundColor: '#d7d7d7',
  },
  buttonText: {
    fontSize: 18,
    color: 'white',
    alignSelf: 'center'
  },
  addButton: {
    height: 36,
    backgroundColor: '#48BBEC',
    borderColor: '#48BBEC',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    alignSelf: 'stretch',
    justifyContent: 'center'
  },
  buttonContainer: {
    flexDirection: 'row',
    marginVertical: 5,
    backgroundColor: 'transparent',
  },
});
