// ==UserScript==
// @name         XDown YouTube Downloader
// @name:zh-TW   XDown-YouTube 下載器
// @name:zh-CN   XDown-YouTube 下载器
// @namespace    https://xdown.org/
// @version      0.0.1
// @description  Used XDown YouTube 
// @description:zh-TW  使用XDown便捷下载YouTube
// @description:zh-CN  使用XDown便捷下载YouTube
// @author       xdown.org
// @match        https://*.youtube.com/*
// @require      https://unpkg.com/vue@2.6.10/dist/vue.js
// @require      https://unpkg.com/xfetch-js@0.3.4/xfetch.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @compatible   firefox >=52
// @compatible   chrome >=55
// @license      MIT
// ==/UserScript==

;(function() {
	'use strict'
	const XYouTubeVersion = "0.0.1";
	const DEBUG = true
	const RESTORE_ORIGINAL_TITLE_FOR_CURRENT_VIDEO = true
	const createLogger = (console, tag) =>
		Object.keys(console)
			.map(k => [k, (...args) => (DEBUG ? console[k](tag + ': ' + args[0], ...args.slice(1)) : void 0)])
			.reduce((acc, [k, fn]) => ((acc[k] = fn), acc), {})
	const logger = createLogger(console, 'YTDL')

	const LANG_FALLBACK = 'en'
	const LOCALE = {
		en: {
			togglelinks: 'Show/Hide Download',
			stream: 'Stream',
			adaptive: 'Adaptive',
			videoid: 'Video Id: ',
			videoExt: 'Video Format',
			thumbnail: 'Thumbnail',
			inbrowser_adaptive_merger: 'In browser adaptive video & audio merger'
		},
		'zh-tw': {
			togglelinks: '顯示 / 隱藏下載',
			stream: '串流 Stream',
			adaptive: '自適應 Adaptive',
			videoid: '影片 ID: ',
			videoExt: 'Video Format',
			thumbnail: '影片縮圖',
			inbrowser_adaptive_merger: '瀏覽器版自適應影片及聲音合成器'
		},
		zh: {
			togglelinks: '显示 / 隐藏下载',
			stream: '串流 Stream',
			adaptive: '自适应 Adaptive',
			videoid: '视频 ID: ',
			videoExt: 'Video Format',
			thumbnail: '视频缩图',
			inbrowser_adaptive_merger: '浏览器版自适应视频及声音合成器'
		},
		kr: {
			togglelinks: '링크 보이기/숨기기',
			stream: '스트리밍',
			adaptive: '조정 가능한',
			videoid: 'Video Id: {{id}}',
			videoExt: 'Video Format'
		},
		es: {
			togglelinks: 'Mostrar/Ocultar Links',
			stream: 'Stream',
			adaptive: 'Adaptable',
			videoid: 'Id del Video: ',
			videoExt: 'Video Format',
			thumbnail: 'Miniatura',
			inbrowser_adaptive_merger: 'Acoplar Audio a Video '
		},
		he: {
			togglelinks: 'הצג/הסתר קישורים',
			stream: 'סטרים',
			adaptive: 'אדפטיבי',
			videoid: 'מזהה סרטון: {{id}}',
			videoExt: 'Video Format'
		}
	}
	const findLang = l => {
		// language resolution logic: zh-tw --(if not exists)--> zh --(if not exists)--> LANG_FALLBACK(en)
		l = l.toLowerCase().replace('_', '-')
		if (l in LOCALE) return l
		else if (l.length > 2) return findLang(l.split('-')[0])
		else return LANG_FALLBACK
	}
	const $ = (s, x = document) => x.querySelector(s)
	const $el = (tag, opts) => {
		const el = document.createElement(tag)
		Object.assign(el, opts)
		return el
	}
	const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const parseDecsig = data => {
		try {
			if (data.startsWith('var script')) {
				// they inject the script via script tag
				const obj = {}
				const document = { createElement: () => obj, head: { appendChild: () => {} } }
				eval(data)
				data = obj.innerHTML
			}
			const fnnameresult = /\.set\([^,]*,encodeURIComponent\(([^(]*)\(/.exec(data)
			const fnname = fnnameresult[1]
			const _argnamefnbodyresult = new RegExp(escapeRegExp(fnname) + '=function\\((.+?)\\){(.+?)}').exec(data)
			const [_, argname, fnbody] = _argnamefnbodyresult
			const helpernameresult = /;(.+?)\..+?\(/.exec(fnbody)
			const helpername = helpernameresult[1]
			const helperresult = new RegExp('var ' + escapeRegExp(helpername) + '={[\\s\\S]+?};').exec(data)
			const helper = helperresult[0]
			logger.log(`parsedecsig result: %s=>{%s\n%s}`, argname, helper, fnbody)
			return new Function([argname], helper + '\n' + fnbody)
		} catch (e) {
			logger.error('parsedecsig error: %o', e)
			logger.info('script content: %s', data)
			logger.info(
				'If you encounter this error, please copy the full "script content" to https://pastebin.com/ for me.'
			)
		}
	}
	const parseQuery = s => [...new URLSearchParams(s).entries()].reduce((acc, [k, v]) => ((acc[k] = v), acc), {})
	const getVideo = async (id, decsig) => {
		return xf
			.get(`https://www.youtube.com/get_video_info?video_id=${id}&el=detailpage`)
			.text()
			.then(async data => {
				const obj = parseQuery(data)
				const playerResponse = JSON.parse(obj.player_response)
				logger.log(`video %s data: %o`, id, obj)
				logger.log(`video %s playerResponse: %o`, id, playerResponse)
				if (obj.status === 'fail') {
					throw obj
				}
				let stream = []
				if (playerResponse.streamingData.formats) {
					stream = playerResponse.streamingData.formats.map(x => Object.assign(x, parseQuery(x.cipher)))
					logger.log(`video %s stream: %o`, id, stream)
					if (stream[0].sp && stream[0].sp.includes('sig')) {
						stream = stream
							.map(x => ({ ...x, s: decsig(x.s) }))
							.map(x => ({ ...x, url: x.url + `&sig=${x.s}` }))
					}
				}

				let adaptive = []
				if (playerResponse.streamingData.adaptiveFormats) {
					adaptive = playerResponse.streamingData.adaptiveFormats.map(x =>
						Object.assign(x, parseQuery(x.cipher))
					)
					logger.log(`video %s adaptive: %o`, id, adaptive)
					if (adaptive[0].sp && adaptive[0].sp.includes('sig')) {
						adaptive = adaptive
							.map(x => ({ ...x, s: decsig(x.s) }))
							.map(x => ({ ...x, url: x.url + `&sig=${x.s}` }))
					}
				}
				logger.log(`video %s result: %o`, id, { stream, adaptive })
				return { stream, adaptive, meta: obj }
			})
	}
	const getVideoDetails = id =>
		xf
			.get('https://www.googleapis.com/youtube/v3/videos', {
				qs: {
					key: 'AIzaSyBk6o0igFl-P4Qe4ouVlRTPlqX7kruWdUg',
					part: 'snippet',
					id
				}
			})
			.json(r => r.items[0])
		const getHighresThumbnail = id =>
		getVideoDetails(id).then(
			details =>
				Object.values(details.snippet.thumbnails)
					.map(d => {
						const x = {}
						x.url = d.url
						x.size = d.width * d.height
						return x
					})
					.sort((a, b) => b.size - a.size)[0].url
		)
	const workerMessageHandler = async e => {
		const decsig = await xf.get(e.data.path).text(parseDecsig)
		const result = await getVideo(e.data.id, decsig)
		self.postMessage(result)
	}
	const ytdlWorkerCode = `
importScripts('https://unpkg.com/xfetch-js@0.3.4/xfetch.min.js')
const DEBUG=${DEBUG}
const logger=(${createLogger})(console, 'YTDL')
const escapeRegExp=${escapeRegExp}
const parseQuery=${parseQuery}
const parseDecsig=${parseDecsig}
const getVideo=${getVideo}
self.onmessage=${workerMessageHandler}`
	const ytdlWorker = new Worker(URL.createObjectURL(new Blob([ytdlWorkerCode])))
	const workerGetVideo = (id, path) => {
		logger.log(`workerGetVideo start: %s %s`, id, path)
		return new Promise((res, rej) => {
			const callback = e => {
				ytdlWorker.removeEventListener('message', callback)
				logger.log('workerGetVideo ---', e.data);
				res(e.data)
			}
			ytdlWorker.addEventListener('message', callback)
			ytdlWorker.postMessage({ id, path })
		})
	}

	const template = `
	<div class="xdown-box" :class="{'dark':dark}">
	<div class="fs-14px" :class="{'hide':xdownCrx }">
		未安装<a href="https://xdown.org">XDown</a>插件 &nbsp;&nbsp;
		<a target="_blank" href="https://chrome.google.com/webstore/detail/xdown/eapmjcdkdlenhkbanlgacimfibbbiinc">
			安装插件
		</a>
	</div>
	<div class="fs-14px" :class="{'hide':!xdownCrx }">
		<div class="t-center fs-14px" :class="{'hide': videoId && xdownCrx }" v-text="'XDown-YouTube正在解析'"></div>
		<div class="t-center fs-14px" :class="{'hide': !videoId && xdownCrx}" v-text="strings.videoid+videoId"></div>
	</div>
	<div :class="{'hide':(!xdownCrx || !videoId) }">
		<div @click="hide=!hide" class="box-toggle t-center fs-14px" v-text="strings.togglelinks"></div>
		<div :class="{'hide':hide}">
			<div class="d-flex">
				<div class="f-1 of-h">
					<div class="t-center fs-14px xdown-file-name"  v-text="xdownFileName">
					</div>
					<div class="video-item-div">
						<div class="file-ext-div" v-for="(item,index) in xdownExt['video']">
							<input type="radio" :id="item" name="videoFormat" :value="item" v-model="xdownVideoValue">
							<label :for="item">{{ item }}</label>
						</div>
						<div class="f-1 of-h" v-for="linkItem in xdownVideo">
							<button class="ytdl-link-btn fs-14px" @click="startDownVideoItem(linkItem)">
								 {{ displayDownVideoItem(linkItem) }}
							</button>
						</div>
					</div>
					<div class="audio-item-div">
						<div class="file-ext-div" v-for="(item,index) in xdownExt['audio']">
							<input type="radio" :id="item" name="audioFormat" :value="item" v-model="xdownAudioValue">
							<label :for="item">{{ item }}</label>
						</div>
						<div class="f-1 of-h" v-for="linkItem in xdownAudio">
							<button class="ytdl-link-btn fs-14px" @click="startDownAudioItem(linkItem)">
								 {{ displayDownAudioItem(linkItem) }}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	</div>
`.slice(1)
	const app = new Vue({
		data() {
			return {
				hide: true,
				videoId: '',
				stream: [],
				adaptive: [],
				xdownCrx: false,
				xdownVersionVal: '',
				xdownVersionTxt: '',
				xdownFileName: 'unknown',
				xdownLengthSeconds: 0,
				xdownVideo: [],
				xdownVideoValue: 'mkv',
				xdownAudio: [],
				xdownAudioValue: 'm4a',
				xdownMediumType: 'video',
				xdownExt: { 'video': [ "mkv" ,"mp4" ], 'audio': ["m4a", "mp3"] },
				dark: false,
				thumbnail: null,
				lang: findLang(navigator.language)
			}
		},
		methods: {
			checkPluginVersion: function() {
				let curTimestamp = (new Date()).valueOf();
				let xTimesamp = localStorage.getItem('xdown-timestamp');
				let xVersion = localStorage.getItem('xdown-version');
				GM_setValue('current_version', XYouTubeVersion);
				let getCheckTimestamp = GM_getValue('current_checktimestamp');
				console.log('getCheckTimestamp==', getCheckTimestamp || 0);
				if(!getCheckTimestamp || getCheckTimestamp < 0 ||  getCheckTimestamp - curTimestamp > (60 * 60 * 2 * 1000) ) {
					xf.get('https://update.xdown.org/a/xdown-youtube-version.json', {
							qs: {
								'xdown-youtube': XYouTubeVersion,
								'chrome-crx': xVersion,
								't': curTimestamp
							},
							method: 'GET',
							mode: 'cors'
						}).then(res => {
							return res.json();
						}).then(json => {
						console.log('xdown-youtube-version==', json);
						let chkXVersion = json['chrome-crx']['version'];
						let chkXYouTubeVersion = json['xdown-youtube']['version'];
						let chkXUpdateURL = json['updateurl'];
						if( XYouTubeVersion != chkXYouTubeVersion) {
							alert('XDown-YouTube发现新版本,请更新!');
							location.href = chkXUpdateURL;
						} else {
							GM_setValue('current_checktimestamp', (new Date()).valueOf());
						}
						return json;
					}).catch(err => {
						console.log('请求错误', err);
					})
				}
			},
			formatFileLength: function(fileLengthVal) {
				if(!fileLengthVal) {
					return '-';
				}
				if(fileLengthVal < 1024) {
					return `${fileLengthVal}B`;
				} else if (fileLengthVal < 1024 * 1024 ) {
					return (fileLengthVal / 1024.0).toFixed(2) + 'KB';
				} else if (fileLengthVal <  1024 * 1024 * 1024 ) {
					return (fileLengthVal / (1024 * 1024) ).toFixed(2) + 'MB';
				} else {
					return (fileLengthVal / (1024 * 1024 * 1024) ).toFixed(2) + 'GB';
				}
			},
			startDownVideoItem: function(linkItem) {
				var evt = document.createEvent("CustomEvent");
				var xDownData = {
					linkType: 4,
					linkList: [
						{
							linkTxt:  linkItem.videoItem.url,
							fileName: `${this.xdownFileName}.${linkItem.videoItem.fileExt}`,
							fileSize: linkItem.videoItem.contentLength
						},
						{
							linkTxt:  linkItem.audioItem.url,
							fileName: `${this.xdownFileName}.${linkItem.audioItem.fileExt}`,
							fileSize: linkItem.audioItem.contentLength
						}
					],
					convertFileSize: linkItem.fileLengthVal,
					convertFileName: `${this.xdownFileName}.${this.xdownVideoValue}`,
					httpHeaders: {
						'User-Agent': navigator.userAgent
					}
				}
				evt.initCustomEvent('ADD-XDOWN-EVENT', true, false, JSON.stringify(xDownData));
				document.dispatchEvent(evt);
			},
			displayDownVideoItem: function(linkItem) {
				return `${linkItem.videoItem.qualityLabel}/${linkItem.videoItem.codecs}/${linkItem.audioItem.codecs} | ${this.formatFileLength(linkItem.fileLengthVal)} | to XDown`;
			},
			startDownAudioItem: function(linkItem) {
				var evt = document.createEvent("CustomEvent");
				var xDownData = {
					linkType: 3,
					linkList: [
						{
							linkTxt:  linkItem.url,
							fileName: `${this.xdownFileName}.${linkItem.fileExt}`,
							fileSize: linkItem.contentLength,
							convertFileName: `${this.xdownFileName}.${this.xdownAudioValue}`
						}
					],
					httpHeaders: {
						'User-Agent': navigator.userAgent
					}
				}
				evt.initCustomEvent('ADD-XDOWN-EVENT', true, false, JSON.stringify(xDownData));
				document.dispatchEvent(evt);
			},
			displayDownAudioItem: function(linkItem) {
				return `${linkItem.codecs} | ${this.formatFileLength(linkItem.contentLength)} | to XDown`;
			}
		},
		computed: {
			strings() {
				return LOCALE[this.lang.toLowerCase()]
			}
		},
		watch: {
			async hide() {
				if (this.thumbnail == null) {
					app.thumbnail = await getHighresThumbnail(this.id)
				}
			}
		},
		mounted: function() {
			this.checkPluginVersion();
		},
		template
	})
	logger.log(`default language: %s`, app.lang)

	// attach element
	const shadowHost = $el('div')
	const shadow = shadowHost.attachShadow ? shadowHost.attachShadow({ mode: 'closed' }) : shadowHost // no shadow dom
	logger.log('shadowHost: %o', shadowHost)
	const container = $el('div')
	shadow.appendChild(container)
	app.$mount(container)

	if (DEBUG && typeof unsafeWindow !== 'undefined') {
		// expose some functions for debugging
		unsafeWindow.$app = app
		unsafeWindow.parseQuery = parseQuery
		unsafeWindow.parseDecsig = parseDecsig
		unsafeWindow.getVideo = getVideo
	}

	const getLangCode = () => {
		if (typeof ytplayer !== 'undefined') {
			return ytplayer.config.args.host_language
		} else if (typeof yt !== 'undefined') {
			return yt.config_.GAPI_LOCALE
		}
		return null
	}
	const textToHtml = t => {
		// URLs starting with http://, https://
		t = t.replace(
			/(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim,
			'<a href="$1" target="_blank">$1</a>'
		)
		t = t.replace(/\n/g, '<br>')
		return t
	}
	const applyOriginalTitle = meta => {
		const data = eval(`(${meta.player_response})`).videoDetails // not a valid json, so JSON.parse won't work
		if ($('#eow-title')) {
			// legacy youtube
			$('#eow-title').textContent = data.title
			$('#eow-description').innerHTML = textToHtml(data.shortDescription)
		} else if ($('h1.title')) {
			// new youtube (polymer)
			$('h1.title').textContent = data.title
			$('yt-formatted-string.content').innerHTML = textToHtml(data.shortDescription)
		}
	}
	const loadParse = async videoId => {
		try {
			let xTimesamp = localStorage.getItem('xdown-timestamp');
			let xVersion = localStorage.getItem('xdown-version');
			if(!xVersion) {
				app.xdownCrx = false;
				app.xdownVersionVal = '';
				app.xdownVersionTxt = '未安装CRX插件!';
			} else {
				app.xdownCrx = true;
				app.xdownVersionVal = xVersion;
				app.xdownVersionTxt = 'CRX插件版本:' + xVersion;
				if(xTimesamp && xTimesamp.length == 13 && !isNaN(xTimesamp)) {
					let tmpDate = new Date(parseFloat(xTimesamp));
					if(tmpDate) {
						app.xdownVersion = app.xdownVersion + ',插件加载日期:' + formatDate(tmpDate);
					}
				}
			}

			const basejs =
				typeof ytplayer !== 'undefined'
					? 'https://' + location.host + ytplayer.config.assets.js
					: $('script[src$="base.js"]').src
			const data = await workerGetVideo(videoId, basejs)
			logger.log('video loaded: %s', videoId)
			if (RESTORE_ORIGINAL_TITLE_FOR_CURRENT_VIDEO) {
				try {
					applyOriginalTitle(data.meta)
				} catch (e) {
					// just make sure the main function will work even if original title applier doesn't work
				}
			}
			app.videoId = videoId;
			app.stream = data.stream;
			app.adaptive = data.adaptive;
			app.meta = data.meta;

			function formatDate(curDate) { 
				var year = curDate.getFullYear(); 
				var month = curDate.getMonth()+1; 
				if(month < 10) {
					month = '0' + month;
				}
				var date = curDate.getDate(); 
				if(date < 10) {
					date = '0' + date;
				}
				var hour = curDate.getHours(); 
				if(hour < 10) {
					hour = '0' + hour;
				}
				var minute = curDate.getMinutes(); 
				if(minute < 10) {
					minute = '0' + minute;
				}
				var second = curDate.getSeconds(); 
				if (second < 10) {
					second = '0' + second;
				}
				return year + "-" + month + "-" + date + " " + hour + ":" + minute+":"+second; 
			}

			app.xdownFileName = '';
			if (data.meta.player_response && data.meta.player_response)  {
				let playerObj = JSON.parse(data.meta.player_response);
				if(playerObj.videoDetails && playerObj.videoDetails.title) {
					app.xdownFileName = playerObj.videoDetails.title;
					app.xdownLengthSeconds = playerObj.videoDetails.lengthSeconds;
				}
			}
			if(app.xdownFileName) {
				app.xdownFileName = app.xdownFileName.replace(/\./g,'').replace(/\//g,'').replace(/\\/g,'').trim();
			}

			if(app.adaptive) {
				let audioKeyDict = { "mp4a.40.2": 1000, "vorbis": 800, "opus":500 };
				let videoKeyDict = { "p60": 5000, "p": 4000 };
				let vcodecKeyDict = { "vp9.2": 800, "vp9": 500};
				let audioArrayList = [];
				let videoArrayList = [];
				for(let idx = 0; idx < app.adaptive.length; idx++) {
					let curItem = app.adaptive[idx];
					let qualityLabel = curItem.qualityLabel || '';
					if (curItem.mimeType && curItem.mimeType.indexOf(';') != -1) {
						let groupKey = '';
						let orderIdx = 0;
						let extPos = 0;
						let nSplitArray = curItem.mimeType.split(';');
							if(nSplitArray && nSplitArray.length >= 2) {
							let curFormat = nSplitArray[0].trim();
							let curExt = '';
							extPos = curFormat.indexOf('/');
							if(extPos != -1) {
								curExt = curFormat.substr(extPos);
							}
							curExt = curExt.replace(/\//g,'');
							let curCodecs = nSplitArray[1].trim().replace('codecs=','').replace(/\"/g,'');
							if (curFormat.indexOf('audio') != -1 ) {
								// audio 
								curItem.format = curFormat;
								curItem.codecs = curCodecs;
								if (curCodecs.indexOf('mp4a') != -1) {
									curExt = 'm4a';
								} else if(curExt.indexOf('webm') != -1) {
									curExt = "weba";
								}
								curItem.fileExt = curExt;
								curItem.groupKey = curCodecs;
								curItem.orderIdx = audioKeyDict[curCodecs] || 0;
								audioArrayList.push(curItem);
							} else if (qualityLabel && qualityLabel.indexOf('p') > 0) {
								// video
								let nTmpPos = qualityLabel.indexOf('p');
								let groupKey = qualityLabel.substr(0,nTmpPos);
								let orderKey = qualityLabel.substr(nTmpPos);
								if (orderKey.indexOf('hdr') != -1) {
									orderIdx = 6000;
								} else {
									orderIdx = videoKeyDict[orderKey] || 0;
								}
								curItem.orderKey = orderKey;
								curItem.fileExt = curExt;
								curItem.format = curFormat;
								curItem.codecs = curCodecs;
								curItem.orderIdx = orderIdx + (vcodecKeyDict[curCodecs] || 0);
								curItem.groupKey = groupKey;
								videoArrayList.push(curItem);
							}
						}
					}
				}
				function groupByKey( array , f ) {
						let groups = {};
						array.forEach( function( o ) {
							let group = JSON.stringify( f(o) );
							groups[group] = groups[group] || [];
							groups[group].push( o );
						});
						return Object.keys(groups).map( function( group ) {
						return groups[group];
					});
				}
				let groupVideoArray = groupByKey(videoArrayList, function(item) {
					return item.groupKey;
				});
				// console.log('groupVideoArray--',groupVideoArray);
				let filterXDownMap = {};
				let filetrXDownKey = [];
				for(let videoIdx in groupVideoArray) {
					let videoList = groupVideoArray[videoIdx];
					if(videoList && Array.isArray(videoList) && videoList.length > 0) {
						let sortVideoList = videoList.sort(function(a,b) { return b.orderIdx - a.orderIdx });
						let findVideoItem = sortVideoList[0];
						filetrXDownKey.push(findVideoItem.groupKey);
						filterXDownMap[findVideoItem.groupKey.toString()] = {
							'videoItem': findVideoItem
						};
					}
				}
				app.xdownVideo.splice(0);
				app.xdownAudio.splice(0);
				let videoIdx = 0
				let audioListSize = audioArrayList.length;
				let audioSortArrayList = audioArrayList.sort(function(a,b) { return b.orderIdx - a.orderIdx});
				let sortedKeyList = filetrXDownKey.sort(function(a,b) { return b - a});
				for(let tmpIdx in sortedKeyList) {
					let tmpKey = sortedKeyList[tmpIdx];
					let tmpVal = filterXDownMap[tmpKey];
					if (audioSortArrayList && audioSortArrayList.length > 0) {
						if (tmpKey >= 720 ) {
							tmpVal['audioItem'] = audioSortArrayList[0];
						} else {
							videoIdx = videoIdx + 1;
							if(audioListSize > videoIdx) {
								tmpVal['audioItem'] = audioSortArrayList[videoIdx];
							} else {
								tmpVal['audioItem'] = audioSortArrayList[audioListSize-1];
							}
						}
						tmpVal.fileLengthVal = parseFloat(tmpVal['videoItem'].contentLength || 0)
								 + parseFloat(tmpVal['audioItem'].contentLength || 0 );
						app.xdownVideo.push(tmpVal);
					}
				}
				//console.log('---app.xdownVideo--',app.xdownVideo);

				let audioCodecsMap = {};
				for(let tmpIdx in audioArrayList) {
					let tmpKey = audioArrayList[tmpIdx].codecs;
					if(tmpKey) {
						if(!audioCodecsMap[tmpKey]) {
							audioCodecsMap[tmpKey] = '1';
							app.xdownAudio.push(audioArrayList[tmpIdx]);
						}
					}
				}
				//console.log('---app.xdownAudio--',app.xdownAudio);
			}

			// lazy load thumbnail to save quota, so it will only load thumbnail when expanding
			// app.thumbnail = await getHighresThumbnail(videoId)
			app.thumbnail = null

			const actLang = getLangCode()
			if (actLang !== null) {
				const lang = findLang(actLang)
				logger.log('youtube ui lang: %s', actLang)
				logger.log('ytdl lang:', lang)
				app.lang = lang
			}
		} catch (err) {
			logger.error('load', err)
		}
	}
	let prev = null
	setInterval(() => {
		const el =
			$('#info-contents') ||
			$('#watch-header') ||
			$('.page-container:not([hidden]) ytm-item-section-renderer>lazy-list')
		if (el && !el.contains(shadowHost)) {
			el.appendChild(shadowHost)
		}
		if (location.href !== prev) {
			logger.log(`page change: ${prev} -> ${location.href}`)
			prev = location.href
			if (location.pathname === '/watch') {
				shadowHost.style.display = 'block'
				const videoId = parseQuery(location.search).v
				logger.log('start loading new video: %s', videoId)
				app.hide = true; // fold it
				loadParse(videoId)
			} else {
				shadowHost.style.display = 'none'
			}
		}
	}, 1000)

	// listen to dark mode toggle
	const $html = $('html')
	new MutationObserver(() => {
		app.dark = $html.getAttribute('dark') === 'true'
	}).observe($html, { attributes: true })
	app.dark = $html.getAttribute('dark') === 'true'

	const css = `
.hide{
	display: none;
}
.t-center{
	text-align: center;
}
.d-flex{
	display: flex;
}
.f-1{
	flex: 1;
}
.fs-14px{
	font-size: 14px;
}
.of-h{
	overflow: hidden;
}
.xdown-box{
	margin-top: 4px;
	border-bottom: 1px solid var(--yt-border-color);
	font-family: Arial;
	border: solid 1px #3153b3;
}
.xdown-file-name {
	margin-top: 5px;
	margin-bottom: 5px;
}
.video-item-div {
	margin-left: 4px;
	margin-bottom: 4px;
	vertical-align: top;
	border: solid 1px #065ed6;
	float: left;
	width: 48%;
	height: 100%;
}
.audio-item-div {
	margin-right: 4px;
	margin-bottom: 4px;
	vertical-align: top;
	border: solid 1px #065ed6;
	float: right;
	width: 48%;
	height: 100%;
}
.box-toggle{
	margin: 3px;
	user-select: none;
	-moz-user-select: -moz-none;
}
.box-toggle:hover{
	color: blue;
}
.ytdl-link-btn{
	display: block;
	border: 1px solid !important;
	border-radius: 3px;
	text-decoration: none !important;
	outline: 0;
	text-align: center;
	padding: 2px;
	margin: 5px;
	color: black;
}
a.ytdl-link-btn{
text-decoration: none;
}
a.ytdl-link-btn:hover{
color: blue;
}
.box.dark{
color: var(--ytd-video-primary-info-renderer-title-color, var(--yt-primary-text-color));
}
.box.dark .ytdl-link-btn{
color: var(--ytd-video-primary-info-renderer-title-color, var(--yt-primary-text-color));
}
.box.dark .ytdl-link-btn:hover{
color: rgba(200, 200, 255, 0.8);
}
.box.dark .box-toggle:hover{
color: rgba(200, 200, 255, 0.8);
}
.file-ext-div {
	display: inline-block;
	margin: 4px;
}
`
	shadow.appendChild($el('style', { textContent: css }))
})()