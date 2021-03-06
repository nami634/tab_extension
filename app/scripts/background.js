// Enable chromereload by uncommenting this line:
// import 'chromereload/devonly'
const STORAGE = chrome.storage.local;
const BOOKMARKS = chrome.bookmarks;
const RUNTIME = chrome.runtime;
const TABS = chrome.tabs;
const WINDOWS = chrome.windows;
const COMMANDS = chrome.commands;
const FOLDER_NAMES = ['Favorite', 'Check', 'Other', 'Project'];

RUNTIME.onInstalled.addListener(function (detail) {
  if (detail.reason == "install") {
    initStorage().then(function (result) {
      if (!result) {
        console.log('error!');
        return false;
      }
      initFolder().then(function (result) {
        if (result) {
          initBookmarkData().then(function () {
            STORAGE.get("user_settings", function (data) {
              data["user_settings"]["beginner"] = true;
              STORAGE.set(data);
            });
          });
        }
      });
    });
  } else if (detail.reason == "update") {
    var key_object;
    key_object = {
      bookmarks: false, user_settings: false, projects: false
    };
    STORAGE.get(key_object, function (result) {
      if (!result["bookmarks"]) result["bookmarks"] = {};
      if (!result["projects"]) result["projects"] = {};
      if (!result["user_settings"]) result["user_settings"] = {};
      if (!result["user_settings"]["folders"]) result["user_settings"]["folders"] = {};
      if (!result["user_settings"]["max_results"]) result["user_settings"]["max_results"] = 20;
      STORAGE.set(result, function () {
        for (let i = 1; i <= 3; i++) {
          if (!result["user_settings"]["folders"][i]) {
            initFolder();
            break;
          }
        }
      });
    });
  }
});

function initBookmarkData() {
  return new Promise(function (resolve) {
    let data = {};
    data["bookmarks"] = {};
    getBookmarkAll().then(function (bookmarks) {
      for (let i = 0; i < bookmarks.length; i++) {
        let bookmark = bookmarks[i];
        data["bookmarks"][bookmark.id] = {};
        data["bookmarks"][bookmark.id]["level"] = 3;
        data["bookmarks"][bookmark.id]["scroll"] = 0;
        data["bookmarks"][bookmark.id]["count"] = 0;
      }
      STORAGE.set(data, resolve());
    });
  });
}

function initStorage() {
  return new Promise(function (resolve, reject) {
    var data;
    data = {
      bookmarks: {}, user_settings: {
        folders: {}, max_results: 20
      }, projects: {}
    };
    STORAGE.set(data, function () {
      var error = RUNTIME.lastError;
      if (error) reject(error);
      resolve(true);
    });
  });
}

function initFolder() {
  return new Promise(function (resolve) {
    let folder_ids = [];
    BOOKMARKS.create({'title': FOLDER_NAMES[0], parentId: "1"}, function (folder1) {
      folder_ids.push(folder1.id);
      BOOKMARKS.create({'title': FOLDER_NAMES[1], parentId: "1"}, function (folder2) {
        folder_ids.push(folder2.id);
        BOOKMARKS.create({'title': FOLDER_NAMES[2], parentId: "1"}, function (folder3) {
          folder_ids.push(folder3.id);
          BOOKMARKS.create({'title': FOLDER_NAMES[3], parentId: "1"}, function (folder4) {
            folder_ids.push(folder4.id);
            setInitFolderId(folder_ids).then(function (result) {
              if (result) resolve(true);
            });
          });
        });
      });
    });
  });
}

function setInitFolderId(folder_ids) {
  return new Promise(function (resolve) {
    STORAGE.get("user_settings", function (user_settings) {
      for (let i = 0; i < 4; i++) {
        user_settings["user_settings"]["folders"][i + 1] = folder_ids[i];
      }
      STORAGE.set(user_settings, function () {
        resolve(true);
      })
    });
  });
}

COMMANDS.onCommand.addListener(function (command) {
  if (command == "delete_bookmark") {
    WINDOWS.getCurrent(function (window) {
      TABS.getSelected(window.id, function (tab) {
        getBookmarkAll().then(function (bookmarks) {
          let bookmark = searchBookmarkUrl(bookmarks, tab.url);
          if (!bookmark) return;
          deleteBookmark(bookmark);
        });
      });
    });
  }
});

BOOKMARKS.onCreated.addListener(function (bookmark_id, bookmark) {
  console.log("new_bookmark_id : " + bookmark_id);
  if (!bookmark.children) {
    STORAGE.get("bookmarks", function (data) {
      data["bookmarks"][bookmark_id] = {
        "level": 3, "scroll": 0, "count": 0
      };
      STORAGE.set(data);
    });
  }
});


BOOKMARKS.onMoved.addListener(function (bookmark_id, moveInfo) {
  if (moveInfo.parentId == moveInfo.oldParentId) return;
  STORAGE.get(function (data) {
    let folders = data["user_settings"]["folders"];
    levelChecker(folders, bookmark_id).then(function (bookmark_level) {
      BOOKMARKS.get(bookmark_id, function (moved_bookmark) {
        BOOKMARKS.getSubTree(moved_bookmark[0].parentId, function (bookmark_tree) {
          let bookmarks = [];
          createBookmarkArray(bookmark_tree, bookmarks);
          let bookmarks_levels = [];
          let bookmark_ids = [];
          for (let i = 0; i < bookmarks.length; i++) {
            bookmark_ids.push(bookmarks[i].id);
            bookmarks_levels.push(bookmark_level);
          }
          setBookmarkLevel(bookmark_ids, bookmarks_levels).then(function () {
            let directory = bookmark_tree[0].children;
            let delete_projects = [];
            let create_project_titles = [];
            let create_project_ids = [];
            for (let i = 0; i < directory.length; i++) {
              if (directory[i].url) continue;
              if (bookmark_level == 4) {
                if (Object.keys(data["projects"]).indexOf(directory[i].id) < 0) {
                  create_project_titles.push(directory[i].title);
                  create_project_ids.push(directory[i].id);
                }
              } else {
                if (Object.keys(data["projects"]).indexOf(directory[i].id) >= 0) {
                  delete_projects.push(directory[i].id);
                }
              }

            }
            if (delete_projects.length >= 1) {
              deleteProjects(delete_projects);
            }
            if (create_project_ids.length >= 1) {
              createProjects(create_project_titles, create_project_ids);
            }
          });
        });
      });
    });
  });
});

function deleteProjects(bookmark_ids) {
  return new Promise(function (resolve) {
    STORAGE.get("projects", function (data) {
      let projects = Object.keys(data["projects"]);
      for (let i = 0; i < bookmark_ids.length; i++) if (projects.indexOf(bookmark_ids[i]) >= 0) delete data["projects"][bookmark_ids[i]];
      STORAGE.set(data, resolve());
    });
  });
}

function levelChecker(folders, bookmark_id) {
  return new Promise(function (resolve) {
    BOOKMARKS.get(bookmark_id, function (bookmark) {
      if (bookmark[0].parentId) {
        let index = Object.values(folders).indexOf(bookmark[0].parentId);
        if (index >= 0) {
          resolve(index + 1);
        } else {
          levelChecker(folders, bookmark[0].parentId).then(function (res) {
            resolve(res);
          });
        }
      } else {
        resolve(3);
      }
    });
  });
}

BOOKMARKS.onRemoved.addListener(function (bookmark_id, remove_info) {
  STORAGE.get('user_settings', function (data) {
    let deleted = [false, false, false, false];
    let folder_ids = Object.values(data["user_settings"]["folders"]);
    checkFoldersRemoved([remove_info.node], folder_ids, deleted).then(function () {
      let check = false;
      let functions = [];
      for (let i = 0; i < deleted.length; i++) {
        if (deleted[i]) {
          check = true;
          let func = newFolder(deleted[i], true, folder_ids, i + 1, null);
          functions.push(func);
        }
      }
      if (!check) {
        deleteBookmarkStorage(bookmark_id);
        return;
      }
      Promise.all(functions).then(function () {
        for (let i = 0; i < folder_ids.length; i++) {
          data["user_settings"]["folders"][i + 1] = folder_ids[i];
        }
        setInitFolderId(folder_ids).then(function () {
          STORAGE.get('bookmarks', function (bookmarks_data) {
            removeBookmarkFolderUpdateStorage(deleted[0], folder_ids[0], bookmarks_data).then(function () {
              removeBookmarkFolderUpdateStorage(deleted[1], folder_ids[1], bookmarks_data).then(function () {
                removeBookmarkFolderUpdateStorage(deleted[2], folder_ids[2], bookmarks_data).then(function () {
                  removeBookmarkFolderUpdateStorage(deleted[3], folder_ids[3], bookmarks_data).then(function () {
                    STORAGE.set(bookmarks_data);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

function removeBookmarkFolderUpdateStorage(old, updated_id, data) {
  return new Promise(function (resolve) {
    if (old) {
      BOOKMARKS.getSubTree(updated_id, function (tree) {
        let new_bookmarks = [];
        createBookmarkArray(tree, new_bookmarks);
        let old_bookmarks = [];
        createBookmarkArray([old], old_bookmarks);
        for (let i = 0; i < new_bookmarks.length; i++) {
          let old_bookmark = searchBookmarkUrl(old_bookmarks, new_bookmarks[i].url);
          if (old_bookmark && data["bookmarks"][old_bookmark.id]) {
            data["bookmarks"][new_bookmarks[i].id] = data["bookmarks"][old_bookmark.id];
          } else {
            data["bookmarks"][new_bookmarks[i].id] = {
              "level": 3, "scroll": 0, "count": 0
            };
          }
          delete data["bookmarks"][old_bookmark.id];
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function checkFoldersRemoved(nodes, folder_ids, deleted) {
  return new Promise(function (resolve) {
    let functions = [];
    for (let i = 0; i < nodes.length; i++) {
      let index = folder_ids.indexOf(nodes[i].id);
      if (index >= 0) deleted[index] = nodes[i];
      if (nodes[i].children) {
        let func = checkFoldersRemoved(nodes[i].children, folder_ids, deleted);
        functions.push(func);
      } else {
        resolve();
      }
    }
    Promise.all(functions).then(function (result) {
      resolve(result);
    });
  });
}


// nodeを探って下の階層もブックマークに登録する
function newFolder(node, p_folder, folder_ids, level, parent) {
  return new Promise(function (resolve) {
    if (p_folder) parent = "1";
    BOOKMARKS.create({title: node.title, url: node.url, parentId: parent}, function (folder) {
      if (p_folder) folder_ids[level - 1] = folder.id;
      if (node.children) {
        if (node.children.length >= 1) {
          let functions = [];
          for (let i = 0; i < node.children.length; i++) {
            let func = newFolder(node.children[i], false, folder_ids, level, folder.id);
            functions.push(func);
          }
          Promise.all(functions).then(function () {
            resolve();
          });
        } else {
          resolve();
        }
      } else {
        resolve();
      }
    });
  });
}

TABS.onRemoved.addListener(function (tab_id, removeInfo) {
  if (removeInfo.isWindowClosing) return;
  STORAGE.get("projects", function (data) {
    if (!data) return;
    let project = null;
    let project_id = null;
    Object.keys(data["projects"]).some(function (id) {
      if (data["projects"][id]["open_window"] == removeInfo.windowId) {
        project = data["projects"][id];
        project_id = id;
        return true;
      }
    });
    if (project) {
      Object.keys(project["tabs"]).some(function (id) {
        if (id == tab_id.toString()) {
          delete project["tabs"][id];
          data["projects"][project_id] = project;
          STORAGE.set(data);
          return true;
        }
      });
    }
  });
});

TABS.onReplaced.addListener(function (addedTabId, removedTabId) {
  TABS.get(addedTabId, function (new_tab) {
    STORAGE.get("projects", function (data) {
      if (!data) return;
      let project = null;
      let project_id = null;
      Object.keys(data["projects"]).some(function (id) {
        if (data["projects"][id]["open_window"] == new_tab.windowId) {
          project = data["projects"][id];
          project_id = id;
          return true;
        }
      });
      if (project) {
        Object.keys(project["tabs"]).some(function (id) {
          if (id == removedTabId.toString()) {
            delete project["tabs"][id];
            data["projects"][project_id] = project;
            STORAGE.set(data);
            return true;
          }
        });
      }
    });
  });
});

TABS.onUpdated.addListener(function (tab_id, info, tab) {
  if (info.status == "complete") {
    if (tab.url == "chrome://newtab/") return;
    STORAGE.get("projects", function (data) {
      let project = null;
      let project_id = null;
      Object.keys(data["projects"]).some(function (id) {
        if (data["projects"][id]["open_window"] == tab.windowId) {
          project = data["projects"][id];
          project_id = id;
          return true;
        }
      });
      if (project) {
        project["tabs"][tab_id] = tab;
        data["projects"][project_id] = project;
        STORAGE.set(data);
      }
    });
  }
});

WINDOWS.onRemoved.addListener(function (window_id) {
  STORAGE.get("projects", function (data) {
    let project_data = null;
    let project_id = null;
    Object.keys(data["projects"]).some(function (id) {
      if (data["projects"][id]["open_window"] == window_id) {
        project_data = data["projects"][id];
        project_id = id;
        return true;
      }
    });
    if (project_data) {
      BOOKMARKS.getChildren(project_id, function (bookmarks) {
        let functions = [];
        let bookmark_ids = [];
        let update_bookmarks = [];
        let levels = [];
        Object.keys(project_data["tabs"]).forEach(function (tab_id) {
          let tab = project_data["tabs"][tab_id];
          let bookmark = searchBookmarkUrl(bookmarks, tab["url"]);
          if (!bookmark) {
            if (!tab.title) return true;
            let func = newBookmark(tab.title, tab.url, 4, project_id).then(function (result) {
              bookmark_ids.push(result.id);
              update_bookmarks.push(result.id);
            });
            levels.push(4);
            functions.push(func);
          } else {
            update_bookmarks.push(bookmark.id);
          }
        });
        Promise.all(functions).then(function () {
          setBookmarkLevel(bookmark_ids, levels).then(function () {
            data["projects"][project_id]["open_window"] = null;
            data["projects"][project_id]["tabs"] = {};
            STORAGE.set(data, function () {
              bookmarks.forEach(function (bookmark) {
                if (update_bookmarks.indexOf(bookmark.id) == -1) {
                  deleteBookmark(bookmark);
                }
              });
            });
          });
        });
      });
    }
  });
});


RUNTIME.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.get_bookmark_all) {
    getBookmarkAll().then(function (result) {
      sortBookmarks(result).then(function (bookmarks) {
        sendResponse({bookmarks: bookmarks});
      });
    });
  }
  if (message.bookmark_level) {
    setBookmarkLevel([message.bookmark_level.bookmark_id], [message.bookmark_level.level]).then(function (result) {
      sendResponse({result: result});
    });
    let key_object = {};
    key_object["user_settings"] = {};
    key_object["user_settings"]["folders"] = {};
    key_object["user_settings"]["folders"][message.bookmark_level.level] = null;
    STORAGE.get(key_object, function (folder) {
      let folder_id = folder["user_settings"]["folders"][message.bookmark_level.level];
      BOOKMARKS.move(message.bookmark_level.bookmark_id, {parentId: folder_id});
    });
  }
  if (message.update_bookmark) {
    let data = message.update_bookmark;
    updateBookmark(data.bookmark_id, data.title, data.url, data.parent).then(function (bookmark) {
      setBookmarkLevel([data.bookmark_id], [data.level]).then(function (result) {
        sendResponse({result: [bookmark, result]});
      });
    });
  }
  if (message.getBookmarkLevel) {
    getBookmarkLevel(message.getBookmarkLevel.bookmark_id).then(function (result) {
      sendResponse({result: result});
    });
  }
  if (message.getStorage) {
    getStorage().then(function (result) {
      sendResponse({result: result});
    });
  }
  if (message.newBookmark) {
    newBookmark(message.newBookmark.title, message.newBookmark.url, message.newBookmark.level, message.newBookmark.parent).then(function (bookmark) {
      setBookmarkLevel([bookmark.id], [message.newBookmark.level]).then(function (result) {
        sendResponse(result);
      });
    });
  }
  if (message.getAllWindow) {
    getAllWindow().then(function (windows) {
      sendResponse(windows);
    });
  }
  if (message.closeTab != null) {
    closeTab(sender.url, message.closeTab);
  }
  if (message.openTab) {
    openTab(message.openTab).then(function (response) {
      let level = response.level;
      let scroll = response.scroll;
      sendResponse({scroll: scroll, level: level});
    });
  }
  if (message.newProject) {
    let name = message.newProject.name;
    let windowId = message.newProject.windowId;
    STORAGE.get('projects', function (data) {
      let project = null;
      Object.keys(data["projects"]).some(function (id) {
        if (data["projects"][id]["open_window"] == windowId) {
          project = data["projects"][id];
          return true;
        }
      });
      if (project) {
        return;
      }
      createProjects([name], null).then(function (projects) {
        let project_id = projects[0].id;
        TABS.getAllInWindow(windowId, function (tabs) {
          let bookmark_ids = [];
          let functions = [];
          let levels = [];
          tabs.forEach(function (tab) {
            if (tab.url == "chrome://newtab/") return;
            let func = newBookmark(tab.title, tab.url, 4, project_id).then(function (bookmark) {
              bookmark_ids.push(bookmark.id);
            });
            levels.push(4);
            functions.push(func);
          });
          Promise.all(functions).then(function () {
            setBookmarkLevel(bookmark_ids, levels).then(function () {
              setProject(project_id, windowId).then(function () {
                initProjectTabs(tabs, project_id);
              });
            });
          });
        });
      });
    });
  }
  if (message.getAllProject) {
    getAllProjects().then(function (projects) {
      sendResponse(projects);
    });
  }
  if (message.getFolders) {
    getFolders().then(function (folders) {
      sendResponse(folders);
    });
  }
  if (message.openProject) {
    STORAGE.get("projects", function (data) {
      let open_window = data["projects"][message.openProject.project_id]["open_window"];
      if (open_window) {
        WINDOWS.update(open_window, {focused: true});
      } else {
        openProject(message.openProject.project_id);
      }
    });
  }
  return true;
});

function updateBookmark(bookmark_id, title, url, parent) {
  return new Promise(function (resolve) {
    BOOKMARKS.update(bookmark_id, {title: title, url: url}, function (bookmark) {
      BOOKMARKS.move(bookmark_id, {parentId: parent}, function () {
        resolve(bookmark);
      });
    });
  });
}

function getFolders() {
  return new Promise(function (resolve) {
    STORAGE.get("user_settings", function (data) {
      let functions = [];
      for (let i = 1; i <= 3; i++) {
        functions.push(getFolderTree(data, i));
      }
      Promise.all(functions).then(function (folders) {
        createFolderList(folders);
        resolve(folders);
      });
    });
  });
}

function getFolderTree(data, level) {
  return new Promise(function (resolve) {
    BOOKMARKS.getSubTree(data["user_settings"]["folders"][level], function (res) {
      resolve(res[0]);
    });
  });
}

function createFolderList(folders) {
  return folders = folders.filter(function (element) {
    if (element.children) {
      element.children = createFolderList(element.children);
    }
    return (!element.url);
  });
}

function openProject(project_id) {
  BOOKMARKS.getChildren(project_id, function (bookmarks) {
    let urls = [];
    for (let i = 0; i < bookmarks.length; i++) {
      urls.push(bookmarks[i].url);
    }
    WINDOWS.create({url: urls, focused: true}, function (window) {
      setProject(project_id, window.id).then(function () {
        initProjectTabs(window.tabs, project_id);
      });
    });
  });
}

function initProjectTabs(tabs, project_id) {
  STORAGE.get("projects", function (data) {
    var project = data["projects"][project_id];
    if (!project) return false;
    for (let i = 0; i < tabs.length; i++) {
      project["tabs"][tabs[i].id] = tabs[i];
    }
    data["projects"][project_id] = project;
    STORAGE.set(data);
  });
}

function getAllProjects() {
  return new Promise(function (resolve, reject) {
    STORAGE.get(function (data) {
      BOOKMARKS.getChildren(data["user_settings"]["folders"][4], function (projects) {
        let project_ids = Object.keys(data["projects"]) || [];
        for (let i = 0; i < projects.length; i++) {
          for (let j = 0; j < project_ids.length; j++) {
            if (projects[i].id == project_ids[j]) {
              break;
            }
            if (j == project_ids.length - 1) delete projects[i];
          }
        }
        resolve(projects);
      });
    });
  });
}

function createProjects(names, project_ids) {
  return new Promise(function (resolve) {
    STORAGE.get(function (data) {
      let folder_id = data["user_settings"]["folders"][4];
      if (project_ids) {
        for (let i = 0; i < project_ids.length; i++) {
          data["projects"][project_ids[i]] = {};
          data["projects"][project_ids[i]]["tabs"] = {};
          data["projects"][project_ids[i]]["open_window"] = null;
        }
        STORAGE.set(data, resolve(data));
      } else {
        let functions = [];
        for (let i = 0; i < names.length; i++) {
          let func = createProjectFolder(folder_id, names[i]);
          functions.push(func);
        }
        Promise.all(functions).then(function (results) {
          for (let i = 0; i < results.length; i++) {
            data["projects"][results[i].id] = {};
            data["projects"][results[i].id]["tabs"] = {};
            data["projects"][results[i].id]["open_window"] = null;
          }
          STORAGE.set(data, resolve(results));
        });
      }
    });
  });
}

function createProjectFolder(folder_id, name) {
  return new Promise(function (resolve) {
    BOOKMARKS.create({parentId: folder_id, title: name}, function (project) {
      resolve(project);
    });
  });
}

function setProject(project_id, window_id) {
  return new Promise(function (resolve) {
    STORAGE.get("projects", function (data) {
      data["projects"][project_id]["open_window"] = window_id;
      STORAGE.set(data, resolve("success"));
    });
  });
}

function openTab(url) {
  return new Promise(function (resolve) {
    getBookmarkAll().then(function (bookmark_all) {
      let bookmark = searchBookmarkUrl(bookmark_all, url);
      if (!bookmark) return;
      let id = bookmark.id;
      STORAGE.get("bookmarks", function (data) {
        if (data["bookmarks"][id]["level"] == 2) {
          deleteBookmark(bookmark);
        }
        if (data["bookmarks"][id]["level"] > 1) {
          resolve({scroll: data["bookmarks"][id]["scroll"], level: data["bookmarks"][id]["level"]});
        } else {
          resolve({scroll: 0, level: data["bookmarks"][id]["level"]});
        }
      });
    });
  });
}

function closeTab(url, scroll) {
  getBookmarkAll().then(function (bookmark_all) {
    let bookmark = searchBookmarkUrl(bookmark_all, url);
    if (!bookmark) return;
    let id = bookmark.id;
    STORAGE.get("bookmarks", function (data) {
      if (!data["bookmarks"][id]) data["bookmarks"][id] = {};
      if (!data["bookmarks"][id]["level"]) data["bookmarks"][id]["level"] = 3;
      if (!data["bookmarks"][id]["count"]) data["bookmarks"][id]["count"] = 0;
      if (data["bookmarks"][id]["level"] > 1) data["bookmarks"][id]["scroll"] = scroll;
      data["bookmarks"][id]["count"] = parseInt(data["bookmarks"][id]["count"]) + 1;
      STORAGE.set(data);
    });
  });
}

function newBookmark(title, url, level, parent_id) {
  return new Promise(function (resolve, reject) {
    flag = true;
    let key_object = {};
    key_object["user_settings"] = {};
    key_object["user_settings"]["folders"] = {};
    key_object["user_settings"]["folders"][level] = null;
    STORAGE.get(key_object, function (folder) {
      parent_id = parent_id || folder["user_settings"]["folders"][level];
      let bookmark_data = {
        'title': title, 'url': url, 'parentId': parent_id
      };
      BOOKMARKS.create(bookmark_data, function (bookmark) {
        if (!bookmark) reject('failed');
        flag = false;
        resolve(bookmark);
      });
    });
  });
}

function deleteBookmark(bookmark) {
  BOOKMARKS.remove(bookmark.id);
}

function getBookmarkAll() {
  return new Promise(function (resolve, reject) {
    BOOKMARKS.getTree(function (desktop_bookmarks) {
      var result = [];
      if (desktop_bookmarks) {
        createBookmarkArray(desktop_bookmarks, result);
        resolve(result);
      } else {
        reject('failed');
      }
    });
  });
}

function setBookmarkLevel(bookmark_ids, levels) {
  return new Promise(function (resolve) {
    STORAGE.get("bookmarks", function (data) {
      for (let i = 0; i < bookmark_ids.length; i++) {
        let bookmark_id = bookmark_ids[i];
        let level = levels[i];
        if (!data["bookmarks"][bookmark_id]) data["bookmarks"][bookmark_id] = {
          "level": 3, "scroll": 0, "count": 0
        };
        data["bookmarks"][bookmark_id]["level"] = parseInt(level);
      }
      STORAGE.set(data, resolve("success"));
    });
  });
}

function getBookmarkLevel(bookmark_id) {
  return new Promise(function (resolve, reject) {
    let key_object = {};
    key_object["bookmarks"] = {};
    key_object["bookmarks"][bookmark_id] = null;
    STORAGE.get(key_object, function (bookmark) {
      if (bookmark) resolve(bookmark.level);
      reject("failed");
    });
  });
}

function getStorage() {
  return new Promise(function (resolve) {
    STORAGE.get(function (items) {
      resolve(items);
    });
  });
}

function deleteBookmarkStorage(bookmark_id) {
  STORAGE.get("bookmarks", function (data) {
    Object.keys(data["bookmarks"]).forEach(function (key) {
      if (key == bookmark_id) {
        delete data["bookmarks"][key];
        return true;
      }
    });
    STORAGE.set(data, function () {
      deleteProjects([bookmark_id]);
    });
  });
}

function getAllWindow() {
  return new Promise(function (resolve) {
    WINDOWS.getAll({populate: true}, function (windows) {
      resolve(windows);
    });
  });
}

function createBookmarkArray(bookmarks, result) {
  result = result || [];
  bookmarks.forEach(function (val) {
    if (val.children) {
      createBookmarkArray(val.children, result);
    } else if (val.url) {
      val.type = "bookmark";
      result.push(val);
    }
  });
}

function sortBookmarks(bookmarks) {
  return new Promise(function (resolve) {
    getStorage().then(function (data) {
      bookmarks.sort(function (a, b) {
        if (!data["bookmarks"][a.id]) return;
        if (!data["bookmarks"][b.id]) return;
        let a_level = data["bookmarks"][a.id]["level"];
        let b_level = data["bookmarks"][b.id]["level"];
        let a_count = data["bookmarks"][a.id]["count"];
        let b_count = data["bookmarks"][b.id]["count"];
        if (a_level < b_level) return -1;
        if (a_level > b_level) return 1;
        if (a_count > b_count) return -1;
        if (a_count < b_count) return 1;
      });
      resolve(bookmarks);
    });
  });
}

function searchBookmarkUrl(bookmarks, url) {
  for (let i = 0; i < bookmarks.length; i++) {
    let val = bookmarks[i];
    let result;
    if (val.url == url) {
      result = val;
    }

    if (result) return result;
  }
  return false;
}