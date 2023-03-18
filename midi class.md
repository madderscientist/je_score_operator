# js-midi库
因为我比较了解midi底层，嫌现成的库自由度不高，就自己写了个js前端midi库[midi.js](./midi.js)。数据结构如下：

## mtrk
一个midi音轨类，类名来自midi协议音轨开头的ascii。包含三个成员：
- name: 音轨名
- events: 一个列表，每一项是一个[midi事件](#midievent)。
- last_tick: 上次添加的事件的事件。对于数据结构并无帮助，仅助于连续添加事件。

### 提供的函数（按使用重要性排序）
- **addEvent**：添加事件
- **export**：导出为midi文件数据
- **JSON**：转化为json对象
- **sort**：事件按时间排序
- **align**：事件对齐
- **toJSON**：响应JSON.stringify
- [static] **tick_hex**
- [static] **string_hex**
- [static] **number_hex**


## midi
midi类，组织多音轨。数据结构如下：
- bpm、tick、time_signature、name: 用于生成midi默认初始数据。其中：
    - tick: 一个四分音符的tick数，导出midi文件时在头数据"MThd"中使用。一般设置为120的倍数。
    - bpm、time_signature、name: 对于midi1文件，将在0号音轨（全局音轨）中添加事件（设置速度和节拍型），是midi的初始配置。
- Mtrk: mtrk列表。导出时每个mtrk会生成一个音轨数据。由于本库中mtrk与midi耦合度很低，有关时值的计算需要自行完成。

### 提供的函数（按使用重要性排序）
- **addTrack**：添加音轨
- [static] **import**：解析midi文件
- **export**：导出为midi文件
- **align**：对齐所有音轨
- **JSON**：转化为json对象
- **toJSON**：响应JSON.stringify


## 本库中的midi event
<span id="midievent">为保证自由度，本库的事件非常底层。阅读过16进制midi文件的读者会感到十分相似。</span>
mtrk中的一个事件结构如下所示：
```
{
    ticks: number,
    code: number,
    [type: number,]
    value: Array
}
```

- ticks: 事件发生的tick。
- code: midi事件类别。例如，midi文件协议中，"按下音符"这个事件的类别为'0x9?'，'?'是一个数，表示第几个音轨。本库中用0x9表示音符事件，而'?'将在导出时，根据事件所在的mtrk在midi类中的id确定。注意，如果是0xff事件（非MIDI事件(Non- MIDI events)，也叫meta-event(元事件)），因为与音轨无关，将使用0xff。
- *type: 当code为0xff时才应有此属性，表示种类。
- value: 其余的所有数据。

> code(type)有哪些可参看[midi协议参考](https://www.jianshu.com/p/59d74800b43b)

在导出为midi时，会自动将ticks转换为midi协议的变长数据、为code加上音轨序号、如果是0xff会添加参数数目。例子见下。


## midiEvent
提供了部分事件的快速添加，将人可理解的事件转换为mtrk中存储的事件。有关事件tick的参数都需要自己计算。
```
例子：假设一个四分音符为480tick，音轨为0。事件对应如下：

使用midiEvent: （使用者添加事件的友好形式）
    midiEvent.time_signature(0, 4, 4)           // 改变节奏型为4/4拍
    midiEvent.note(480*4, 480*0.75, 0x3C, 100)  // 4个4分音符之后放一个中央C的附点8分音符，力度为100

mtrk中的event:（类中存储的数据形式）
    {ticks: 0, code: 0xff, type: 0x58, value: [4, 2]}       // 0时刻改变节奏。按midi协议，分子取log2
    {ticks: 480*4, code: 0x9, value: [0x3C, 100]}           // 在1920ticks时以100力度按下中央C
    {ticks: 480*4 + 480*0.75, code: 0x9, value: [0x3C, 0]}  // 在2280tick时松开中央C

midi文件中: （导出为midi文件之后的16进制内容）
    00 FF 58 04     // 改变节拍型
    04 02 18 08
    8F 00 90 3C 64  // 音符按下
    82 68 90 3C 00  // 音符松开
```
可见使用midiEvent十分便捷。其他不在midiEvent中的事件需要写mtrk_event【{ticks...}】。

## 使用
下面将用实例展示如何使用此midi库。
### 创建
```
let newMIDI = new midi(120,[4,4],480,[],"Twinkle Twinkle Little Star");
let mt = newMIDI.addTrack();    // 创建音轨
// 添加单个事件可以使用音轨的last_tick
mt.addEvent(midiEvent.note(mt.last_tick, newMIDI.tick, 0x3C, 100));
mt.addEvent({ticks: mt.last_tick, code: 0x9, value: [0x3C, 0x64]});
mt.addEvent([   // 连续添加要注意时间点
    {ticks: mt.last_tick + newMIDI.tick, code: 0x9, value: [0x3C, 0]},
    {ticks: mt.last_tick + newMIDI.tick, code: 0x9, value: [67, 0x64]},
    {ticks: mt.last_tick + 2*newMIDI.tick, code: 0x9, value: [67, 0]}
]);
mt.addEvent([   // 连续添加midiEvent也要注意时间点。
    midiEvent.note(mt.last_tick, newMIDI.tick, 67, 100),
    midiEvent.tempo(mt.last_tick + newMIDI.tick, 480) // 改速度。注意，0xff事件作用于所有音轨
]);
// tick计算很麻烦是不是？可以试试下面的方法
mt.addEvent([   // 连续添加多个midiEvent可使用-1参数简化，表示紧跟
    midiEvent.note(-1, newMIDI.tick, 69, 100),
    midiEvent.note(-1, newMIDI.tick, 69, 100),
    midiEvent.note(-1, newMIDI.tick, 67, 100)
]);
// 混合添加
mt.addEvent([   // 连续添加多个事件也使用-ticks，表示当前位置延时ticks之后追加。注意-1是特殊的，表示当前位置。其余负数均为延时。而0表示时间轴的0
    {ticks: -newMIDI.tick, code: 0x9, value: [65, 100]},
    {ticks: -newMIDI.tick, code: 0x9, value: [65, 0]},
    {ticks: -1, code: 0x9, value: [65, 100]},
    {ticks: -newMIDI.tick, code: 0x9, value: [65, 0]},
    {ticks: -1, code: 0x9, value: [64, 100]},
    {ticks: -newMIDI.tick, code: 0x9, value: [64, 0]},
    midiEvent.note(-1, newMIDI.tick, 64, 100),
    midiEvent.note(-1, newMIDI.tick, 62, 100),
    midiEvent.note(-1, newMIDI.tick, 62, 100),
    midiEvent.note(-1, newMIDI.tick, 60, 100),
]);
let midiData = newMIDI.export(1);   // Uint8Array
```

### 导入
```
let newMIDI = midi.import(midiData)     // 可以从FileReade获取midi文件的Uint8Array数据、
console.log(JSON.stringify(newMIDI))
```

更多使用请参考源代码，有着非常详细的注释