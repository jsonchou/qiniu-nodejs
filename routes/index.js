'use strict'

var express = require('express');
var router = express.Router();

var http = require("http");
var fs = require("fs");
var path = require("path");
var url = require("url");
var async = require('async');

var _ = require('lodash');

const cache = require('memory-cache');
const cachekey = "UZQiniuConfig";
const config = require('../config');

const qiniu = require('qiniu');

/* GET home page. */
router.get('/', function (req, res, next) {
    if (!cache.get(cachekey)) {
        cache.put(cachekey, JSON.stringify(config));
    }
    //console.log(config.PATH); D:\前端事务\发布
    res.render('index', {title: '七牛云存储发布', config: JSON.parse(cache.get(cachekey))});
});

router.post('/', function (req, res, next) {

    let newconfig = {
        PATH: req.body.PATH,
        ACCESS_KEY: req.body.ACCESS_KEY,
        SECRET_KEY: req.body.SECRET_KEY,
        Bucket_Name: req.body.Bucket_Name,
        Uptoken_Url: req.body.Uptoken_Url,
        Domain: req.body.Domain
    }

    //check config equal
    let objbool = _.isEqual(newconfig, config);

    if (!objbool) {
        //save config
        fs.writeFile('config.js', "'use strict';module.exports =" + JSON.stringify(newconfig), function (err) {
            if (err) {
                return console.error(err);
            } else {
                //expire in 5 hours
                cache.put(cachekey, JSON.stringify(newconfig), 1000 * 60 * 5, function (k, v) {
                    console.log('缓存过期，KEY：' + k + "，Value：" + v);
                });
                console.log('写入成功');
            }
        });
    }

    qiniu.conf.ACCESS_KEY = newconfig.ACCESS_KEY;
    qiniu.conf.SECRET_KEY = newconfig.SECRET_KEY;

    let mybucket = newconfig.Bucket_Name;

    //构建上传策略函数
    let _uptoken = function (bucket, key) {
        var putPolicy = new qiniu.rs.PutPolicy(bucket + ":" + key);
        return putPolicy.token();
    };

    //构造上传函数
    let uploadFile = function (uptoken, key, localFile) {
        var extra = new qiniu.io.PutExtra();
        qiniu.io.putFile(uptoken, key, localFile, extra, function (err, ret) {
            if (!err) {
                // 上传成功， 处理返回值
                console.log(ret.hash, ret.key, ret.persistentId);
            } else {
                // 上传失败， 处理返回代码
                console.log(err);
            }
        });
    };

    //递归列出目录所有文件
    let _listFiles = function (dir, callback) {
        fs.readdir(dir, function (err, files) {
            var returnFiles = [];
            async.each(files, function (file, next) {
                var filePath = dir + '/' + file;
                fs.stat(filePath, function (err, stat) {
                    if (err) {
                        return next(err);
                    }
                    if (stat.isDirectory()) {
                        _listFiles(filePath, function (err, results) {
                            if (err) {
                                return next(err);
                            }
                            returnFiles = returnFiles.concat(results);
                            next();
                        })
                    }
                    else if (stat.isFile()) {
                        returnFiles.push(filePath);
                        next();
                    }
                });
            }, function (err) {
                callback(err, returnFiles);
            });
        });
    };

    _listFiles(newconfig.PATH, function (err, files) {

        if (!files.length) {
            console.log('上传文件为空目录');
            return;
        }

        //去除_src
        files = files.map(item = > item.replace('/_src/', '/')
        )
        ;

        //去重
        files = _.uniq(files);

        files.forEach(function (item, idx) {
            let key = item.replace(newconfig.PATH + '/', '').replace();
            let path = item;

            //生成上传 Token
            let mytoken = _uptoken(mybucket, key);

            //调用uploadFile上传
            uploadFile(mytoken, key, path);
        });
    });

    res.render('index', {title: '七牛云存储发布', config: newconfig, status: 1});

});

module.exports = router;
