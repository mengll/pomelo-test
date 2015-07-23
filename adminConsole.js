adminConsole 有三种角色，分别是 master,monitor,client
master : 运行在master进程中，监听端口等待monitor和client的连接。主要负责维护所有已注册的连接，消息路由和处理，以及缓存服务器集群状态信息。
monitor : 运行在各个需要监控的服务器进程中（包括master进程）。启动后连接并注册到master，主要负责收集被监控的进程信息，向master汇报。
client : 运行在admin console的web页面。启动后连接并注册到master。主要负责响应用户操作和呈现master返回结果。
三者之间通讯的消息分为两类：需要响应的消息request和不需要响应的消息notify（通知）。
request：如单点请求某一具体服务器上面的信息。
notify：如收集服务器状态信息的消息。
   request消息格式定义：
   {
        id: 消息id，标志请求和响应的对应关系。Notify不需要这个字段；
        moduleId: 消息的路由字段，指明处理该消息由哪个模块处理；
        body: 消息内容，处理消息所需的key/value数据
   }
   notify消息格式定义：
   {
        moduleId: 消息的路由字段，指明处理该消息由哪个模块处理；
        body: 消息内容，处理消息所需的key/value数据
    }

类说明
consoleService
是整个监控模块的总入口，master和monitor上都需要创建。各个进程向consoleService注册各自的module。ConsoleService根据当前服务器类型，创建底层的agent实例，并负责agent的启动和关闭。consoleService同时也充当了map的角色，缓存收集到的状态信息。
masterAgent
在master进程中启动，负责底层网络通讯相关工作。如：监听端口，接收monitor和client连接，分组维护这些连接以及将消息推送给指定的接收者等。
monitorAgent
在各个需要监控进程中启动（包括master进程）。启动后连接并注册到masterAgent，负责与masterAgent之间的通讯。
module
监控模块接口，实现监控相关的具体逻辑。定义三个回调接口，分别对应于master，monitor和client上的逻辑。
自定义监控模块开发
adminConsole 采用‘类插件’的开发模式，因此为 adminConsole 开发一个新的监控模块是很容易的
下面就通过一个 adminConsole helloPomelo 模块来进行说明
通过请求该监控模块，我们可以从游戏服务器集群中，得到 xxx hello Pomelo (其中 xxx 指的是 serverId)
进行开发前请先仔细阅读上面的介绍文档以及 adminConsole-api-文档
首先我们要在项目路径下 game-server/app/modules/ 文件夹下面新建一个 helloPomelo.js 文件
var Module = function(app, opts) {
    opts = opts || {};
     this.type = opts.type || 'pull';  // 设置该参数，表明该模块监控是由 master 主动拉数据
    this.interval = opts.interval || 5; //master 主动拉数据间隔
};

Module.moduleId = 'helloPomelo';

module.exports = Module; //出口对外接口

Module.prototype.monitorHandler = function(agent, msg) {
    var word = agent.id + ' hello pomelo';
        //把 monitor 监控的数据 notify 给 master 
    agent.notify(Module.moduleId, {serverId: agent.id, body: word});
};

Module.prototype.masterHandler = function(agent, msg) {
        //如果没有消息，则notify 所有的 monitor 拉取数据
    if(!msg) {
        agent.notifyAll(Module.moduleId);
        return;
    }
        //收集从 monitor 拉取的数据
    var data = agent.get(Module.moduleId);
    if(!data) {
        data = {};
        agent.set(Module.moduleId, data);
    }

    data[msg.serverId] = msg;
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    //客户端请求，直接返回 master 中cache的数据
        cb(null, agent.get(Module.moduleId) || {});
};
然后在项目目录下的 app.js 中，添加注册模块的代码
app.configure('production|development', function() {
});
在configure里面添加如下代码就完成了 helloPomelo 监控模块的注册工作
app.registerAdmin('helloPomelo',new helloPomelo());
然后我们可以在 adminConsole web 项目中的 views 文件夹下，添加一个 helloPomelo.html 来进行简单的测试
<html>
    <head>
        <title></title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <script src="/js/socket.io.js"></script>
        <script src="/js/util/protocol.js"></script>
        <script src="/js/client.js"></script>
    </head>
    <body>
        <div id = 'main'></div>
        <script type="text/javascript">
            var client = window.client = new ConsoleClient();
            var host = 'localhost';
            var port = '3005';
            client.connect('xxx', host, port, function(err){
                if(err) throw err;
                client.request('helloPomelo',null,function(err,msg){
                    var dom = document.getElementById('main');
                    for(var key in msg){
                        var elem = document.createElement('p');
                        elem.innerText = msg[key]['body'];
                        dom.appendChild(elem);
                    }
                    console.log(msg);
                });
            });
        </script>
    </body> 
</html>
启动项目主程序以及 adminConsole web
打开支持websocket的浏览器，如 google chrome，输入http://0.0.0.0:7001/module/helloPomelo
就可以看到从游戏服务器集群中获取到的数据
