var SourceMap = require('source-map');
var rSourceMap = /(?:\/\/\#\s*sourceMappingURL[^\r\n\'\"]*|\/\*\#\s*sourceMappingURL[^\r\n\'\"]*\*\/)(?:\r?\n|$)/ig;
var path = require('path');
var _ = fis.util;

var pack_fn = function (ret, pack, settings, opt) {
  var needSortByPackOrder = true;
  var useTrack = true;
  //var useSourceMap = false;
  var root = fis.project.getProjectPath();
  pack = settings;
  var src = ret.src;
  var sources = [];
  var packed = {}; // cache all packed resource.
  var ns = fis.config.get('namespace');
  var connector = fis.config.get('namespaceConnector', ':');
  // 生成数组
  Object.keys(src).forEach(function (key) {
    sources.push(src[key]);
  });
  console.log('---------------------------&&&&&&---------------------------%$$$$---------------------------')
  console.log('---------------------------&&&&&&---------------------------%$$$$---------------------------')
  console.log('---------------------------&&&&&&---------------------------%$$$$---------------------------')
  console.log('---------------------------&&&&&&---------------------------%$$$$---------------------------')
  function find(reg, rExt) {
    var subpath;
    if (reg.indexOf(connector) > 0 ){
         if (reg.split(connector)[0] == ns) {
           subpath = '/' + reg.split(connector)[1];
           if (src[subpath]) {
             return [src[subpath]];
           }
         } else{
           subpath = '../ipage_runtime/hybrid/' + reg.replace(':', '/static/').replace('vue', 'js');
           var file_content = fis.file.wrap(path.join(root, subpath));
           file_content['id'] = reg;
           return [file_content];
         }
    }
  }

  Object.keys(pack).forEach(function (subpath, index) {
  //  var sourceNode = useSourceMap && new SourceMap.SourceNode();
    var patterns = pack[subpath];
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }

    var valid = patterns.every(function(pattern) {
      return typeof pattern === 'string' || pattern instanceof RegExp;
    });

    if (!valid) {
      throw new Error('TypeError: only string and RegExp are allowed.');
    }

    var pid = (ns ? ns + connector : '') + 'p' + index;
    //这里包装了fis file， 所以不用担心common生成的文件问题
    var pkg = fis.file.wrap(path.join(root, subpath));
    // 打包的packager不能和被打包的某一个文件重名
    if (typeof ret.src[pkg.subpath] !== 'undefined') {
      fis.log.warning('there is a namesake file of package [' + subpath + ']');
    }

    var list = [];
    patterns.forEach(function (pattern, index) {
      //排除不需要压缩的文件
      var exclude = typeof pattern === 'string' && pattern.substring(0, 1) === '!';
      if (exclude) {
        pattern = pattern.substring(1);
        // 如果第一个规则就是排除用法，都没有获取结果就排除，这是不合理的用法。
        // 不过为了保证程序的正确性，在排除之前，通过 `**` 先把所有文件获取到。
        // 至于性能问题，请用户使用时规避。
        index === 0 && (list = find('**'));
      }
      var mathes = find(pattern, pkg.rExt);

      list = _[exclude ? 'difference' : 'union'](list, mathes);
    });


    var content = '';
    var has = [];
    var requires = [];
    var requireMap = {};
    list.forEach(function (file) {
      var id = file.getId();
      var c = file.getContent();
      // 派送事件
      var message = {
        file: file,
        content: c,
        pkg: pkg
      };
      fis.emit('pack:file', message);
      c = message.content;
      var prefix = useTrack ? ('/*!' + file.id + '*/\n') : ''; // either js or css
      if (file.isJsLike) {
        prefix = ';' + prefix;
      } else if (file.isCssLike && c) {
        c = c.replace(/@charset\s+(?:'[^']*'|"[^"]*"|\S*);?/gi, '');
      }

      if (content) prefix = '\n' + prefix;

      c = c.replace(rSourceMap, '');

      content += prefix + c;
      requires = requires.concat(file.requires);
      requireMap[id] = true;
      has.push(id);
    });

    if (has.length) {

      pkg.setContent(content);
      ret.pkg[pkg.subpath] = pkg;

      // collect dependencies
      var deps = [];
      requires.forEach(function (id) {
        if (!requireMap[id]) {
          deps.push(id);
          requireMap[id] = true;
        }
      });
      var pkgInfo = ret.map.pkg[pid] = {
        uri: pkg.getUrl(opt.hash, opt.domain),
        type: pkg.rExt.replace(/^\./, ''),
        has: has
      };
      if (deps.length) {
        pkgInfo.deps = deps;
      }
    }
  });
};

module.exports = function (ret, pack, settings, opt) {
  if (!ret) {
      return;
  }
  var setting = {};
  var ids = ret.ids || {};
  var ge_deps = {};
  var components_deps_in_page = {};
  var map_setting = {};
  var node_modules_dpes = {};
  var page_entry_deps = {};
  var path = require('path');
  fis.util.map(ids, function (src, file) {
      if (file.extras.isPage) {
           var requires = file.requires || [];
           var id = file.id;
           var namespaceConnector = fis.config.get('namespaceConnector') || ':';
           var namespace = fis.config.get('namespace');
           var root = fis.project.getProjectPath();
           var common_sourcemap = require(path.join(root, '../ipage_runtime/common-map.json'));
           var this_sourcemap = ret['map'];
           var split;
           var file_path = file.subpathNoExt;
           var allDeps = [];
           ge_deps[file_path] = [];
           components_deps_in_page[file_path] = [];


           // get所有的sourcemap文件
           var getAllDeps = function (sourcemap) {
                sourcemap.forEach(function(item, index) {
                    for(let p in item['res']) {
                        if(item['res'][p]['deps']) {
                            var per_dep = item['res'][p]['deps'];
                            for (var i = 0; i < per_dep.length; i++) {
                                allDeps.push(per_dep[i]);
                                if (per_dep[i].indexOf('node_modules') > 0) {
                                    node_modules_dpes[per_dep[i]] = per_dep[i];
                                }
                            }
                        }
                    }
                });
           }
           getAllDeps([common_sourcemap, this_sourcemap]);

           //递归deps，拿到入口文件的打包文件
           var lookup = function(res, deps) {
               for(let i = 0;i < deps.length;i++) {
                   if ((split = deps[i].indexOf(namespaceConnector)) === -1) {
                        fis.log.error('请先js模块化');
                        return;
                   }
                   if(deps[i].split(namespaceConnector)[0] == 'common') {
                       res = common_sourcemap['res'];
                   }
                   if(res[deps[i]] && res[deps[i]]['deps']) {
                       // 在这里
                       res[deps[i]]['deps'].forEach(function(item, index) {
                            if (item.indexOf(namespaceConnector) === -1) {
                                 // 去除node_modules里的依赖文件
                                 return;
                            }
                            ge_deps[file_path].push(item);
                            components_deps_in_page[file_path].push(item);

                       });
                       if(ge_deps[file_path].length >= allDeps.length) {
                           break;
                       }
                       lookup(res, ge_deps[file_path]);
                   }
               }
           }

           lookup(this_sourcemap['res'], requires);

           // 第一层递归填入
           components_deps_in_page[file_path] = components_deps_in_page[file_path].concat(requires);
      }
  });

  for (var key in components_deps_in_page) {
      map_setting[key + '_componetns.css'] = [];
      map_setting[key + '_componetns.js'] = [];
      page_entry_deps[key + '_componetns.css'] = {};
      page_entry_deps[key + '_componetns.js'] = {};
      var namespaceConnector = fis.config.get('namespaceConnector');
      components_deps_in_page[key].forEach(function (item, index) {
          var pos = item.lastIndexOf('.');
          if (pos > -1) {
              var ext = item.substring(pos).toLowerCase().split('.').pop();
              if (ext == 'vue' || ext == 'js') {
                  if (Object.keys(page_entry_deps[key + '_componetns.js']).indexOf(item) < 0) {
                      var uri = item.split(namespaceConnector)[0] == 'common'
                          ?  '_build/' + item.split(namespaceConnector)[1]
                          :   item.replace(namespaceConnector, '/');
                      if (item.indexOf('node_modules') < 0) {
                          map_setting[key + '_componetns.js'].push(item);
                      }
                  }
                  page_entry_deps[key + '_componetns.js'][item] = item
              }else if (ext == 'css' || ext == 'less') {
                  if (Object.keys(page_entry_deps[key + '_componetns.css']).indexOf(item) < 0) {
                      var uri = item.split(namespaceConnector)[0] == 'common'
                          ?  '_build/' + item.split(namespaceConnector)[1]
                          :   item.replace(namespaceConnector, '/');
                      if (item.indexOf('node_modules') < 0) {
                          map_setting[key + '_componetns.css'].push(item);
                      }
                  }
                  page_entry_deps[key + '_componetns.css'][item] = item;
              }
          }
      });

  }
  //map_setting['/npm/pkg/buddle.js'] = Object.keys(node_modules_dpes);

  pack_fn(ret, pack, map_setting, opt);
};
