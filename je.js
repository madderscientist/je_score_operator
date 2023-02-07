var note = ["1", "#1", "2", "#2", "3", "4", "#4", "5", "#5", "6", "#6", "7"];

//主要函数，bef:要转换的内容；x:输入半音数目，正则升，负则降；Note_aft:转换后的对照表
function Convert(bef, x, Note_aft = note) {
    let aft = '';                 //转换后
    let n = 0;                    //位置
    let octave = 0;               //八度音高
    while (n < bef.length) {
        let m = 0;                //升降半音
        if (bef[n] == ')' || bef[n] == '[') ++octave;
        else if (bef[n] == '(' || bef[n] == ']') --octave;
        else {
            if (bef[n] == '#') m = 1;
            else if (bef[n] == 'b') m = -1;
            let position = note.indexOf(bef[n + Math.abs(m)]);      //在列表中的位置
            let N = 0;            //结果的位置
            let name = '';        //音名
            let pitch = 0;        //音高
            let brackets = '';    //括号
            if (position == -1) {
                m = 0;
                aft = aft + bef[n];
            }
            else {
                N = m + position + x;
                {
                    let p = (N % 12 + 12) % 12; //取N除12的模，不是余数！
                    name = Note_aft[p];
                }
                pitch = octave + Math.floor(N / 12);
                for (let i = 1; i <= Math.abs(pitch); i++) brackets = brackets + '[';
                aft = aft + ((pitch > 0) ? brackets : brackets.replace(/\[/g, '(')) + name + ((pitch > 0) ? brackets.replace(/\[/g, ']') : brackets.replace(/\[/g, ')'));
            }
        }
        n = n + Math.abs(m) + 1;
    }
    return aft;
}

//返回：content中有几个key
function countkey(content, key) {
    return content.length - content.replace(new RegExp(key, "gm"), '').length;
}

//一键最简（#最少）
function simplified(bef) {
    let downtimes = 0;
    let aft = '';
    aft = Convert(bef, 0);
    let amount = countkey(aft, '#');
    let min = amount;
    for (let i = 1; i < 12; i++) {
        aft = Convert(aft, -1);
        amount = countkey(aft, '#');
        if (amount < min) {
            min = amount;
            downtimes = i;
            if (min == 0) break;
        }
    }
    alert("降" + downtimes + "调，最少" + min + "个“#”");
    return Convert(bef, -downtimes);
}

//找到极值音，返回序号（[最低，最高]）
function findExtreme(content) {
    let len = content.length;
    let octave = 0;
    let lowest = 0.1;
    let highest = 0.1;
    let n = 0;
    while (n < len) {
        while (n < len) {   //检测括号，判断八度
            if (content[n] == "[" || content[n] == ")") octave += 12;
            else if (content[n] == "]" || content[n] == "(") octave -= 12;
            else break;
            n++;
        }
        if (n < len) {
            let up = 0;       //半音关系
            if (content[n] == "#") up = 1;
            else if (content[n] == "b") up = -1;
            let N = n + Math.abs(up);
            if (N < len) {
                let position = note.indexOf(content[N]);
                if (position < 0) n++;    //不在表格里
                else {
                    position = position + up + octave;
                    if (position < lowest || lowest == 0.1) lowest = position;
                    if (position > highest || highest == 0.1) highest = position;
                    n = N + 1;
                }
            }
            else break; //就是结束了，或者#后面没有东西了
        }
    }
    return [lowest, highest];
}

//把序号转换为je音符，0-->1
function indexToje(index) {
    let position = (index % 12 + 12) % 12;
    let k = Math.floor(index / 12);
    let brackets = '';
    for (let i = 0; i < Math.abs(k); i++) {
        brackets = brackets + '[';
    }
    return ((k > 0) ? brackets : brackets.replace(/\[/g, '(')) + note[position] + ((k > 0) ? brackets.replace(/\[/g, ']') : brackets.replace(/\[/g, ')'));
}

//创建midi，返回midi数据列表
function create_midi(data) {
    /*输入格式：
    {"beat":[bpm,四分音符的相对时长,节拍分子,节拍分母],
    "notes":[
        [
            [音,相对时长,开始的相对时刻(此项可省略)],
            [第二个音信息]
            ……
        ],
        [第二个音轨信息]……
    ]}
    */
    //如果没有对齐，记四分音符相对时长为0，让四份音符的相对时长等于实际毫秒值即可
    var head = [77, 84, 114, 107];
    var end = [0, 255, 47, 0];
    var tknum = 1;              //音轨数
    var itime;                  //四分音符相对时长

    function datalen(data) {    //返回MTrk数据长度，4字节
        let i = data.length;
        let result = new Array(4);
        for (let j = 3; j > -1; j--) {
            result[j] = i % 256;
            i = Math.floor(i / 256);
        }
        return result;
    }
    function setsty(beatinf) {      //设置时长、节拍，返回全局音轨
        //一个四分音符的微秒数
        let derta = Math.round(60000000 / beatinf[0]);
        //一个四分音符的相对时长
        itime = beatinf[1];
        if (!itime) itime = derta / 1000;
        //把一个四份音符的微秒数转为16进制t，midi规范要求固定为3字节
        let t = new Array(3);
        for (let i = 2; i > -1; i--) {
            t[i] = (derta % 256);
            derta = Math.floor(derta / 256);
        }
        //节拍信息
        let fenmu;
        if (beatinf[3]) {
            let temp = parseInt(beatinf[3]);
            fenmu = 0;
            while (temp > 1) {
                temp /= 2;
                fenmu++;
            }
        } else fenmu = 2;
        let b = [0, 255, 88, 4, (beatinf[2]) ? beatinf[2] : 4, fenmu, 24, 8];
        //整合信息部分
        t = [0, 255, 81, 3].concat(t, b, end);
        //生成全局音轨
        return head.concat(datalen(t), t);
    }
    function addmtrk(data) {    //添加音轨,基本思路：按时间线排好事件
        let dt = 0;
        let time = new Array();

        function dertat(ticknum) {  //设置△t，输入tick数，返回时间16进制列表
            ticknum = ticknum.toString(2);
            let i = ticknum.length, j = Math.ceil(i / 7) * 7;
            for (; i < j; i++) {
                ticknum = '0' + ticknum;
            }
            let t = new Array();
            for (i = 0; i + 7 < j; i = i + 7) {
                t.push('1' + ticknum.substring(i, i + 7));
            }
            t.push('0' + ticknum.substr(-7, 7));
            for (i = 0; i < t.length; i++) {
                t[i] = parseInt(t[i], 2);
            }
            return t;
        }
        function addnote(data) {
            let note = data[0];
            if (data.length == 2) {
                time.push([dt, 143 + tknum, note, 100]);
                dt += data[1];
                time.push([dt, 127 + tknum, note, 0]);
            }
            else {
                time.push([data[2], 143 + tknum, note, 100]);
                dt = data[2] + data[1];         //兼容两项和三项
                time.push([dt, 127 + tknum, note, 0]);
            }
        }
        //得到时刻表
        for (let i = 0; i < data.length; i++) {
            addnote(data[i]);
        }
        //理顺时间
        time.sort(function (a, b) { return a[0] - b[0]; });
        //整理成数据
        dt = 0;
        let tk = new Array();
        for (let i = 0; i < time.length; i++) {
            let temp = time[i];
            if (temp[2] > -1 && temp[2] < 128) {
                let DT = temp[0] - dt;
                dt = temp[0];
                tk = tk.concat(dertat(Math.round(120 * DT / itime)), [temp[1], temp[2], temp[3]]);
            }
        }
        tk = tk.concat(end);
        tknum++;
        return head.concat(datalen(tk), tk);
    }
    //整合信息
    let tk0 = setsty(data.beat);
    let note = new Array();
    for (let i = 0; i < data.notes.length; i++) {
        note = note.concat(addmtrk(data.notes[i]));
    }
    let hd = [77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, tknum, 0, 120];  //固定的文件头，midi1，1+x个音轨，120tick
    return hd.concat(tk0, note);
}

function MidiReader(data, mode=true) {  //mode:是按midi0还是按midi1(默认)解析
    /*
    .MTrk: 事件列表，分音轨
    .tick：一个四分音符的tick数
    .bpm：一分钟内四分音符的数量
    .beat: [分子,分母]
    */
    //防midi0：所有音轨信息在一个mtrk里
    let MTrk = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []];
    //读文件头
    this.tick = data[12] * 256 + data[13];
    let i = 17;
    let BPM = 0;
    let beat = [4, 2];
    let mtn=0;  //音轨数

    function readmtrk() {   // 读取一个音轨
        let timeline = 0;   // 时刻，累加，为了多音轨合并
        let event = 0;      // 防midi简写，记录上一个事件种类
        let ifover = true;  // 是否读到结尾

        function readnote() {   //读取一个事件，即事件分条列出
            //获取△t
            let interval = 0;
            while (data[i] > 127) {
                interval = interval * 128 + (data[i++] - 128);
            }
            interval = interval * 128 + data[i++];
            timeline += interval;
            //处理事件
            let flag = true;
            if (data[i] > 127) {                    //标明事件，更新事件，fx在这处理
                if (data[i] == 255) {               //ff
                    flag = false;
                    let state = data[++i];
                    if (state == 47) { ifover = false; }
                    else if (state == 81) { BPM = Math.round(60000000 / (data[i + 2] * 65536 + data[i + 3] * 256 + data[i + 4])); }//一个四分音符的微秒
                    else if (state == 88) { beat[0] = data[i + 2]; beat[1] = data[i + 3]; } //节奏
                    i = i + 2 + data[i + 1];
                } else if (data[i] == 240) {        //f0
                    flag = false;
                    i = i + 2 + data[i + 1];
                } else {
                    event = data[i++];
                }
            }
            if (flag) {
                let x = mode? mtn%16 : event % 16;
                if (event < 192 || event > 223) {       //9x或8x或ax或bx或ex
                    MTrk[x].push([timeline, event, data[i], data[i + 1]]);
                    i += 2;
                } else {                                //cx或dx
                    MTrk[x].push([timeline, event, data[i]]);
                    i += 1;
                }
            }
        }

        //操控读取音符
        for (i += 5; ifover;) {                          //跳过长度标识。i的增加在readnote里面
            readnote();
        }
    }

    while (i < data.length) {
        if (data[i] == 107 && data[i - 1] == 114 && data[i - 2] == 84 && data[i - 3] == 77) {   //是mtrk
            readmtrk(); mtn++;
        }
        else i++;
    }
    for (i = 15; i >= 0; i--) {
        if (MTrk[i].length == 0) {
            MTrk.splice(i, 1);
        }else{
            console.log("st");

            //新加入，排序，防多音轨有同一音轨
            MTrk[i].sort(function (a, b) { return a[0] - b[0]; });
            
            console.log("en")
        }
    }
    this.beat = beat;
    this.bpm = BPM;
    this.MTrk = MTrk;
}

function FQ(midobj) { //传入mid对象
    var fqnote = ["1", "1#", "2", "2#", "3", "4", "4#", "5", "5#", "6", "6#", "7"];
    var longlist = [1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125, 0.11];

    var atick;
    if (midobj && midobj.beat) atick = midobj.tick;
    else atick = 120;

    var aBeat;  //一个节拍的四分音符数
    if (midobj && midobj.beat) aBeat = (midobj.beat[0] / (2 ** (midobj.beat[1] - 2)));
    else aBeat = 4;

    this.maxBeatNum = 0;
    this.BeatNum = 0;

    this.resettick = function (TICK) { atick = TICK; }
    this.resetbeat = function (BEAT) { aBeat = BEAT[0] / (2 ** (BEAT[1] - 2)); }

    this.notelen = function (tone, XIAO, iflast, ifnext, ifjust) {        //传入音名,长度数据,是否跨上一小节,是否跨下一小节,是否刚好
        function limitxiao(s) {
            let x = 0;
            let dd = 1;
            for (let i = 0; i < 8; i++) {
                let d = Math.abs(longlist[i] - s);
                if (d < dd) { dd = d; x = i; }
            }
            return x;
        }

        let ZHENG = Math.floor(XIAO);
        XIAO -= ZHENG;
        let l = '';
        let c = limitxiao(XIAO);

        if (!ifnext) {  //如果跨小节，就不近似
            if (c == 7) XIAO = 0;
            else XIAO = longlist[c];
        }

        switch (c) {
            case 0: ZHENG++; XIAO = 0; break;
            case 1: l = '/.'; break;
            case 2: l = '/'; break;
            case 3: l = '//.'; break;
            case 4: l = '//'; break;
            case 5: l = '///.'; break;
            case 6: l = '///'; break;
        }
        if (tone != '0') {  //一般音符需要连音线
            let yanchang = '';
            for (let i = 1; i < ZHENG; i++) yanchang += '-';

            if (l && ZHENG != 0) l = '(' + tone + ((iflast) ? ')' : '') + l + ((ifnext && ifjust) ? '(' : '') + tone + ')' + yanchang;
            else if (l || ZHENG) l = ((ifnext && ifjust) ? '(' : '') + tone + ((iflast) ? ')' : '') + l + yanchang;

        } else {            //休止不需要
            if (l) l = '0' + l;
            for (let i = 0; i < ZHENG; i++) l += '0';
        }
        this.BeatNum = this.BeatNum + ZHENG + XIAO;
        if (ifnext) {
            l += '|';
            this.BeatNum=Math.round(this.BeatNum);  //防止.9999999
        }
        return l;
    }

    this.indexTofq = function (index) {     //mid序号转番茄简谱音
        index -= 60;
        let position = (index % 12 + 12) % 12;
        let k = Math.floor(index / 12);
        let brackets = '';
        for (let i = 0; i < Math.abs(k); i++) {
            brackets = brackets + "'";
        }
        return fqnote[position] + ((k > 0) ? brackets : brackets.replace(/\'/g, ","));
    }

    this.long = function (ticks, tone) {    //返回音+时值记号
        var dx = ticks / atick;console.log(dx,tone,this.BeatNum,aBeat);
        var last = false;
        var out = '';
        while (1) {
            let n0 = Math.floor(this.BeatNum / aBeat);     //现在在第几小节
            let n = this.BeatNum + dx - (n0 + 1) * aBeat;  //加入后到第几小节
            console.log("in ",this.BeatNum,n0,n,dx);
            if (n > -0.11) {  //如果加入后超小节了
                let dn = dx - n;    //下一小节线的位置
                out += this.notelen(tone, dn, last, true, n > 0.11);
                dx -= dn;
                last = true;
            } else break;
        }
        out += this.notelen(tone, dx, last, false);
        return out;
    }

    this.fqjb = function (data) {
        var fqjp = '';
        this.BeatNum = 0;
        for (let i = 0; i < data.length;) {
            let temp = data[i];console.log(JSON.stringify(temp));
            if (temp[1] > 127 && temp[1] < 160) {       //8x或9x
                if (temp[1] > 143 && temp[3] != 0) {    //播放
                    let temp2 = [];
                    for (i += 1; i < data.length; i++) {
                        temp2 = data[i];
                        if (temp2[0] - temp[0] > 8 && temp2[1] < 160 && temp2[1] > 127) {      //找到有时间间隔的事件 且为8x 9x
                            if (!(temp2[2] != temp[2] && (temp2[3] == 0 || temp[2].toString(16)[0] == '8'))) {  //如果不是其他音的终止，就停
                                break;
                            }
                        }
                    }
                    if (!fqjp) fqjp = this.long(temp[0], '0');console.log(JSON.stringify(temp2)+" temp2");
                    fqjp += this.long(temp2[0] - temp[0], this.indexTofq(temp[2]));
                } else {
                    i++;
                    if (i < data.length) {    //停,后面有空隙就是休止
                        let temp2 = data[i];
                        if (temp2[0] - temp[0] > 8) fqjp += this.long(temp2[0] - temp[0], '0');
                    }
                }
            } else i++;
        }
        this.maxBeatNum = Math.max(this.maxBeatNum, this.BeatNum);
        return fqjp;
    }
}