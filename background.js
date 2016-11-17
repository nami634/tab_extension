const STORAGE = chrome.storage.local;const BOOKMARKS = chrome.bookmarks;const RUNTIME = chrome.runtime;const TABS = chrome.tabs;const WINDOWS = chrome.windows;const COMMANDS = chrome.commands;RUNTIME.onInstalled.addListener(function (detail) {  if (detail.reason == "install") {    initStorage().then(function (result) {      if (!result) {        console.log('error!');        return false;      }      initFolder().then(function (result) {        if (result) {          initBookmarkData();        }      });    });  } else if (detail.reason == "update") {    var key_object;    key_object = {      bookmarks: false,      user_settings: false,      projects: false    };    STORAGE.get(key_object, function (result) {      if (!result["bookmarks"])result["bookmarks"] = {};      if (!result["projects"])result["projects"] = {};      if (!result["user_settings"])result["user_settings"] = {};      if (!result["user_settings"]["folders"])result["user_settings"]["folders"] = {};      if (!result["user_settings"]["max_results"])result["user_settings"]["max_results"] = 20;      STORAGE.set(result, function () {        for (let i = 1; i <= 3; i++) {          if (!result["user_settings"]["folders"][i]) {            initFolder();            break;          }        }      });    });  }});function initBookmarkData() {  let data = {};  data["bookmarks"] = {};  getBookmarkAll().then(function (bookmarks) {    for (let i = 0; i < bookmarks.length; i++) {      let bookmark = bookmarks[i];      data["bookmarks"][bookmark.id] = {};      data["bookmarks"][bookmark.id]["level"] = 3;      data["bookmarks"][bookmark.id]["scroll"] = 0;      data["bookmarks"][bookmark.id]["count"] = 0;    }    STORAGE.set(data);  });}function initStorage() {  return new Promise(function (resolve, reject) {    var data;    data = {      bookmarks: {},      user_settings: {        folders: {},        max_results: 20      },      projects: {}    };    STORAGE.set(data, function () {      var error = RUNTIME.lastError;      if (error) reject(error);      resolve(true);    });  });}function initFolder() {  return new Promise(function (resolve, reject) {    let folder_ids = [];    BOOKMARKS.create({'title': 'Always'}, function (folder1) {      folder_ids.push(folder1.id);      BOOKMARKS.create({'title': 'See later'}, function (folder2) {        folder_ids.push(folder2.id);        BOOKMARKS.create({'title': 'Sometimes'}, function (folder3) {          folder_ids.push(folder3.id);          BOOKMARKS.create({'title': 'Projects'}, function (folder4) {            folder_ids.push(folder4.id);            setInitFolderId(folder_ids).then(function (result) {              if (result) resolve(true);            });          });        });      });    });  });}function setInitFolderId(folder_ids) {  return new Promise(function (resolve) {    STORAGE.get("user_settings", function (user_settings) {      for (let i = 0; i < 4; i++) {        user_settings["user_settings"]["folders"][i + 1] = folder_ids[i];      }      STORAGE.set(user_settings, function () {        resolve(true);      })    });  });}COMMANDS.onCommand.addListener(function (command) {  if (command == "delete_bookmark") {    WINDOWS.getCurrent(function (window) {      TABS.getSelected(window.id, function (tab) {        getBookmarkAll().then(function (bookmarks) {          let bookmark = searchBookmarkUrl(bookmarks, tab.url);          if (!bookmark) return;          deleteBookmark(bookmark);        });      });    });  }});BOOKMARKS.onCreated.addListener(function (bookmark_id, bookmark) {  if (bookmark.children) {    STORAGE.get("bookmarks", function (data) {      data["bookmarks"][bookmark_id] = {        "level": 3,        "scroll": 0,        "count": 0      };      STORAGE.set(data);    });  }});BOOKMARKS.onMoved.addListener(function (project_id, moveInfo) {  STORAGE.get("user_settings", function (data) {    let folders = data["user_settings"]["folders"];    Object.keys(folders).forEach(function (i) {      let folder_id = folders[i];      if (folder_id == moveInfo.parentId) {        if (i == 4) {          BOOKMARKS.getChildren(project_id, function (bookmarks) {            if (bookmarks.length == 0)return;            let bookmark_ids = [];            let levels = [];            bookmarks.forEach(function (bookmark) {              bookmark_ids.push(bookmark.id);              levels.push(4);            });            setBookmarkLevel(bookmark_ids, levels).then(function () {              STORAGE.get("projects", function (data) {                data["projects"][project_id] = {};                data["projects"][project_id]["tabs"] = {};                data["projects"][project_id]["open_window"] = null;                STORAGE.set(data);              });            });          });        } else {          let moved_bookmarks = [];          let move_level = [];          moved_bookmarks.push(bookmark_id);          move_level.push(i);          setBookmarkLevel(moved_bookmarks, move_level);        }      }    });  });});BOOKMARKS.onRemoved.addListener(function (bookmark_id) {  deleteBookmarkStorage(bookmark_id);});TABS.onRemoved.addListener(function (tab_id, removeInfo) {  if (removeInfo.isWindowClosing)return;  STORAGE.get("projects", function (data) {    if (!data)return;    let project = null;    let project_id = null;    Object.keys(data["projects"]).some(function (id) {      if (data["projects"][id]["open_window"] == removeInfo.windowId) {        project = data["projects"][id];        project_id = id;        return true;      }    });    if (project) {      Object.keys(project["tabs"]).some(function (id) {        if (id == tab_id.toString()) {          delete project["tabs"][id];          data["projects"][project_id] = project;          STORAGE.set(data);          return true;        }      });    }  });});TABS.onUpdated.addListener(function (tab_id, info, tab) {  if (info.status == "complete") {    STORAGE.get("projects", function (data) {      let project = null;      let project_id = null;      Object.keys(data["projects"]).some(function (id) {        if (data["projects"][id]["open_window"] == tab.windowId) {          project = data["projects"][id];          project_id = id;          return true;        }      });      if (project) {        project["tabs"][tab_id] = tab;        data["projects"][project_id] = project;        STORAGE.set(data);      }    });  }});WINDOWS.onRemoved.addListener(function (window_id) {  STORAGE.get("projects", function (data) {    let project_data = null;    let project_id = null;    Object.keys(data["projects"]).some(function (id) {      if (data["projects"][id]["open_window"] == window_id) {        project_data = data["projects"][id];        project_id = id;        return true;      }    });    if (project_data) {      BOOKMARKS.getChildren(project_id, function (bookmarks) {        let functions = [];        let bookmark_ids = [];        let update_bookmarks = [];        let levels = [];        console.log(Object.keys(project_data["tabs"]));        Object.keys(project_data["tabs"]).forEach(function (tab_id) {          let tab = project_data["tabs"][tab_id];          let bookmark = searchBookmarkUrl(bookmarks, tab["url"]);          if (!bookmark) {            if (!tab.title)return true;            let func = newBookmark(tab.title, tab.url, 4, project_id).then(function (result) {              bookmark_ids.push(result.id);              update_bookmarks.push(result.id);            });            levels.push(4);            functions.push(func);          } else {            update_bookmarks.push(bookmark.id);          }        });        console.log(functions);        Promise.all(functions).then(function () {          setBookmarkLevel(bookmark_ids, levels).then(function () {            data["projects"][project_id]["open_window"] = null;            data["projects"][project_id]["tabs"] = {};            STORAGE.set(data, function () {              bookmarks.forEach(function (bookmark) {                if (update_bookmarks.indexOf(bookmark.id) == -1) {                  deleteBookmark(bookmark);                }              });            });          });        });      });    }  });});RUNTIME.onMessage.addListener(  function (message, sender, sendResponse) {    if (message.get_bookmark_all) {      getBookmarkAll().then(function (result) {        sortBookmarks(result).then(function (bookmarks) {          sendResponse({bookmarks: bookmarks});        });      });    }    if (message.bookmark_level) {    }    if (message.update_bookmark) {      let data = message.update_bookmark;      updateBookmark(data.bookmark_id, data.title, data.url, data.parent).then(function (bookmark) {        setBookmarkLevel([data.bookmark_id], [data.level]).then(function (result) {          sendResponse({result: [bookmark, result]});        });      });    }    if (message.getStorage) {      getStorage().then(function (result) {        sendResponse({result: result});      });    }    if (message.newBookmark) {      newBookmark(message.newBookmark.title, message.newBookmark.url, message.newBookmark.level, message.newBookmark.parent).then(function (bookmark) {        setBookmarkLevel([bookmark.id], [message.newBookmark.level]).then(function (result) {          sendResponse(result);        });      });    }    if (message.getAllWindow) {      getAllWindow().then(function (windows) {        sendResponse(windows);      });    }    if (message.closeTab != null) {      closeTab(sender.url, message.closeTab);    }    if (message.openTab) {      openTab(message.openTab).then(function (response) {        let level = response.level;        let scroll = response.scroll;        sendResponse({scroll: scroll, level: level});      });    }    if (message.newProject) {      let name = message.newProject.name;      let windowId = message.newProject.windowId;      createProject(name).then(function (project_id) {        TABS.getAllInWindow(windowId, function (tabs) {          let bookmark_ids = [];          let functions = [];          let levels = [];          tabs.forEach(function (tab) {            if (tab.url == "chrome://newtab/")return;            let func = newBookmark(tab.title, tab.url, 4, project_id).then(function (bookmark) {              bookmark_ids.push(bookmark.id);            });            levels.push(4);            functions.push(func);          });          Promise.all(functions).then(function (resolve) {            setBookmarkLevel(bookmark_ids, levels).then(function () {              setProject(project_id, windowId).then(function () {                initProjectTabs(tabs, project_id);              });            });          });        });      });    }    if (message.getAllProject) {      getAllProjects().then(function (projects) {        sendResponse(projects);      });    }    if (message.getFolders) {      getFolders().then(function (folders) {        sendResponse(folders);      });    }    if (message.openProject) {      STORAGE.get("projects", function (data) {        let open_window = data["projects"][message.openProject.project_id];        if (!open_window)return;        openProject(message.openProject.project_id);      });    }    return true;  });function updateBookmark(bookmark_id, title, url, parent) {  return new Promise(function (resolve) {    BOOKMARKS.update(bookmark_id, {title: title, url: url}, function (bookmark) {      BOOKMARKS.move(bookmark_id, {parentId: parent}, function () {        resolve(bookmark);      });    });  });}function getFolders() {  return new Promise(function (resolve) {    STORAGE.get("user_settings", function (data) {      let functions = [];      for (let i = 1; i <= 3; i++) {        functions.push(getFolderTree(data, i));      }      Promise.all(functions).then(function (folders) {        console.log(folders);        createFolderList(folders);        resolve(folders);      });    });  });}function getFolderTree(data, level) {  return new Promise(function (resolve) {    BOOKMARKS.getSubTree(data["user_settings"]["folders"][level], function (res){      resolve(res[0]);    });  });}function createFolderList(folders) {  return folders = folders.filter(function (element){    if (element.children){      element.children = createFolderList(element.children);    }    return (!element.url);  });}function openProject(project_id) {  BOOKMARKS.getChildren(project_id, function (bookmarks) {    let urls = [];    for (let i = 0; i < bookmarks.length; i++) {      urls.push(bookmarks[i].url);    }    WINDOWS.create({url: urls, focused: true}, function (window) {      console.log(window);      setProject(project_id, window.id).then(function () {        initProjectTabs(window.tabs, project_id);      });    });  });}function initProjectTabs(tabs, project_id) {  STORAGE.get("projects", function (data) {    console.log(tabs);    var project = data["projects"][project_id];    if (!project)return false;    for (let i = 0; i < tabs.length; i++) {      project["tabs"][tabs[i].id] = tabs[i];    }    data["projects"][project_id] = project;    console.log(project);    STORAGE.set(data);  });}function getAllProjects() {  return new Promise(function (resolve, reject) {    STORAGE.get("projects", function (data) {      let project_ids = Object.keys(data["projects"]) || [];      console.log(project_ids);      if (project_ids.length > 0) {        BOOKMARKS.get(project_ids, function (projects) {          resolve(projects);        });      }    });  });}function createProject(name) {  return new Promise(function (resolve) {    STORAGE.get("user_settings", function (result) {      let folder_id = result["user_settings"]["folders"][4];      BOOKMARKS.create({parentId: folder_id, title: name}, function (project) {        STORAGE.get("projects", function (data) {          data["projects"][project.id] = {};          data["projects"][project.id]["tabs"] = {};          data["projects"][project.id]["open_window"] = null;          STORAGE.set(data, resolve(project.id));        });      });    });  });}function setProject(project_id, window_id) {  return new Promise(function (resolve) {    STORAGE.get("projects", function (data) {      data["projects"][project_id]["open_window"] = window_id;      console.log(data);      STORAGE.set(data, resolve("success"));    });  });}function openTab(url) {  return new Promise(function (resolve, reject) {    getBookmarkAll().then(function (bookmark_all) {      let bookmark = searchBookmarkUrl(bookmark_all, url);      if (!bookmark) return;      let id = bookmark.id;      STORAGE.get("bookmarks", function (data) {        if (data["bookmarks"][id]["level"] == 2) {          console.log('level2 bookmark deleted!');          deleteBookmark(bookmark);        }        if (data["bookmarks"][id]["level"] == 2 || data["bookmarks"][id]["level"] == 3) {          resolve({scroll: data["bookmarks"][id]["scroll"], level: data["bookmarks"][id]["level"]});        } else {          resolve({scroll: 0, level: data["bookmarks"][id]["level"]});        }      });    });  });}function closeTab(url, scroll) {  getBookmarkAll().then(function (bookmark_all) {    let bookmark = searchBookmarkUrl(bookmark_all, url);    let id = bookmark.id;    STORAGE.get("bookmarks", function (data) {      if (!data["bookmarks"][id])data["bookmarks"][id] = {};      if (!data["bookmarks"][id]["level"])data["bookmarks"][id]["level"] = 2;      if (!data["bookmarks"][id]["count"])data["bookmarks"][id]["count"] = 0;      if (data["bookmarks"][id]["level"] > 1) data["bookmarks"][id]["scroll"] = scroll;      data["bookmarks"][id]["count"] = parseInt(data["bookmarks"][id]["count"]) + 1;      STORAGE.set(data);    });  });}function newBookmark(title, url, level, parent_id) {  return new Promise(function (resolve, reject) {    flag = true;    let key_object = {};    key_object["user_settings"] = {};    key_object["user_settings"]["folders"] = {};    key_object["user_settings"]["folders"][level] = null;    STORAGE.get(key_object, function (folder) {      parent_id = parent_id || folder["user_settings"]["folders"][level];      let bookmark_data = {        'title': title,        'url': url,        'parentId': parent_id      };      BOOKMARKS.create(bookmark_data, function (bookmark) {        if (!bookmark) reject('failed');        flag = false;        resolve(bookmark);      });    });  });}function deleteBookmark(bookmark) {  BOOKMARKS.remove(bookmark.id);}function getBookmarkAll() {  return new Promise(function (resolve, reject) {    BOOKMARKS.getTree(function (desktop_bookmarks) {      var result = [];      if (desktop_bookmarks) {        createBookmarkArray(desktop_bookmarks, result);        resolve(result);      } else {        reject('failed');      }    });  });}function setBookmarkLevel(bookmark_ids, levels) {  return new Promise(function (resolve, reject) {    STORAGE.get("bookmarks", function (data) {      for (let i = 0; i < bookmark_ids.length; i++) {        let bookmark_id = bookmark_ids[i];        let level = levels[i];        if (!data["bookmarks"][bookmark_id]) data["bookmarks"][bookmark_id] = {          "level": 3,          "scroll": 0,          "count": 0        };        data["bookmarks"][bookmark_id]["level"] = parseInt(level);      }      console.log(data);      STORAGE.set(data, resolve("success"));    });  });}function getBookmarkLevel(bookmark_id) {  return new Promise(function (resolve, reject) {    let key_object = {};    key_object["bookmarks"] = {};    key_object["bookmarks"][bookmark_id] = null;    STORAGE.get(key_object, function (bookmark) {      if (bookmark) resolve(bookmark.level);      reject("failed");    });  });}function getStorage() {  return new Promise(function (resolve, reject) {    STORAGE.get(function (items) {      resolve(items);    });  });}function deleteBookmarkStorage(bookmark_id) {  STORAGE.get("bookmarks", function (data) {    Object.keys(data["bookmarks"]).forEach(function (key) {      if (key == bookmark_id) {        delete data["bookmarks"][key];        return true;      }    });    STORAGE.set(data);  });}function getAllWindow() {  return new Promise(function (resolve) {    WINDOWS.getAll({populate: true}, function (windows) {      resolve(windows);    });  });}function createBookmarkArray(bookmarks, result) {  result = result || [];  bookmarks.forEach(function (val) {    if (val.children) {      createBookmarkArray(val.children, result);    } else if (val.url) {      val.type = "bookmark";      result.push(val);    }  });}function sortBookmarks(bookmarks) {  return new Promise(function (resolve) {    getStorage().then(function (data) {      bookmarks.sort(function (a, b) {        if (!data["bookmarks"][a.id])return;        if (!data["bookmarks"][b.id])return;        let a_level = data["bookmarks"][a.id]["level"];        let b_level = data["bookmarks"][b.id]["level"];        let a_count = data["bookmarks"][a.id]["count"];        let b_count = data["bookmarks"][b.id]["count"];        if (a_level < b_level) return -1;        if (a_level > b_level) return 1;        if (a_count > b_count) return -1;        if (a_count < b_count) return 1;      });      resolve(bookmarks);    });  });}function searchBookmarkUrl(bookmarks, url) {  for (let i = 0; i < bookmarks.length; i++) {    let val = bookmarks[i];    let result;    if (val.url == url) {      result = val;    }    if (result) return result;  }  return false;}