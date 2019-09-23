
#### 插件目的
1. 在网页端增加事件，直接将需要下载的链接，发消息到XDown应用程序


#### 接口说明

- 数据结构
```
{
	"linkType": 1,
	"linkList": [
		{"linkTxt":"http://1111.txt/111.txt","fileName":"111.txt"},
		{"linkTxt":"http://1111.txt/111.txt","fileName":"222.txt"}
	],
	"linkConcurrent": 16,
	"httpHeaders": {
	    "User-Agent": "Chrome xxx",
	    "Cookie": "9999",
	    "x-req-from": "1111"
	}
}
```

| 字段名           |   类型    |  是否必填   |  备注                      |
|------------------|:---------:|------------:|---------------------------:|
| linkType         |  数字     |   必填      |  1 为普通http下载          |
| linkList         |  数组     |   必填      |  下载列表，支持批量        |
| linkMagnet       |  数组     |   非必填    |  单个下载磁链              |
| linkConcurrent   |  数字     |   非必填    |  下载并发数 范围 1 ~ 128   |
| httpHeaders      |  字典     |   非必填    |  自定义http头，最多支持7个 |

- linkType 1: 普通 http， 2: 磁链   其他待扩展
- linkConcurrent 范围 1 ~ 128 ， 不传则使用设置里面的 
- linkType 2：磁链， 链接地址 linkMagnet

- 请求示例

```
function startHttp() {
	var evt = document.createEvent("CustomEvent");
	var httpData = '{"linkType":1,"linkList":[{"linkTxt":"http://1111.txt/111.txt"},{"linkTxt":"http://1111.txt/222.txt"}],"linkConcurrent":16,"httpHeaders":{"User-Agent":"Chrome xxx","Cookie":"9999","x-req-from":"1111"}}';
	evt.initCustomEvent('ADD-XDOWN-EVENT', true, false, httpData);
	document.dispatchEvent(evt);
}
```

- js判断XDown的Crx是否安装
```
	let xVersion = localStorage.getItem('xdown-version');
	console.log('xdownCrxVersion:',xVersion);
	
	let xTimestamp = localStorage.getItem('xdown-timestamp');
	console.log('xdownCrxInit:',xTimestamp);
```

-  获取当前CRX的版本号     localStorage.getItem('xdown-version');   当前最新为1.0.2
-  获取当前CRX初始化时间戳 localStorage.getItem('xdown-timestamp'); 比如 1569221353668


