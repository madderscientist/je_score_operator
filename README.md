# je_score_operator

## Abstruct

je简谱处理工具，包括转调、制谱、播放、midi提取与制作等

## Demo

[je转调器](https://madderscientist.github.io/je_score_operator/zdq.html)<br>
[je播放器](https://madderscientist.github.io/je_score_operator/playje.html)<br>
[midi转je/简谱](https://madderscientist.github.io/je_score_operator/miditostr)<br>
[制作midi（利用特定文本）](https://madderscientist.github.io/je_score_operator/midi.html)<br>
[je谱确定节奏](https://madderscientist.github.io/je_score_operator/beat.html)

## Explanation

### 何为je谱？

je谱为约定俗成，并无严格规定格式。但为了各种工具的使用，请按照此处的规则使用

#### 基本格式

- 以简谱的1234567代表七个全音，音符前加‘#’表示升半音，加‘b’表示降半音。如3 #1 5 b7，即 E C# G A#
- (英文小括号里面是低音)[英文方括号里面是高音]，括号可以嵌套，每多一层就再降/升12半音
- 升降记号永远贴着音符，括号包裹在外，可视为音高的运算符。为了方便输入，一个括号里面可以有多个音，比如(6[2b1])表示‘低音A’、‘中音D’、‘低音G’。
- 至于时值节奏，自行把握喽~

#### 优缺点

- 优点：方便编辑，易于传播，占用内存少。
- 缺点：没有时值，依赖原曲————本项目有一半就是针对这个缺点而制作的。

#### je谱资源

- [je谱库](https://github.com/zytx121/je/issues)包含了上千首acg歌曲。
- [je吧](https://tieba.baidu.com/f?kw=justice_eternal&fr=index)是je谱诞生地
- [Acgmuse](https://www.acgmuse.com)是je论坛(奄奄一息

### 转调器

[je转调器](https://madderscientist.github.io/je_score_operator/zdq.html)——保持音符间音程关系不变，改变整体音高的工具。<br>
基本原理：把音符数字化到数轴的一点，整体平移，再根据新位置转为音符。

### je谱播放器

[je播放器](https://madderscientist.github.io/je_score_operator/playje.html)——根据je谱演奏的工具。<br>
基本原理：数字化音符，利用[这个项目](https://github.com/surikov/webaudiofont)播放音频。利用计时器，均匀播放，空格和换行视为休止

### midi转je/简谱

[midi转je/简谱](https://madderscientist.github.io/je_score_operator/miditostr)——解析midi文件的工具。<br>
基本原理：利用midi协议解读音符。【midi协议怎么看？[瞧这!](https://zhuanlan.zhihu.com/p/464166848)】可以解读为没有时值的je谱，也可以解读为‘番茄简谱’脚本：一个图片形式简谱制作网站，保留时值信息。<br>
注意：所有的‘时长’均指相对时长，单位时长到底多长，由bmp参数确定。算法花费大心思近似，因此会导致误伤，最短只支持32分音符。

### midi制作

[制作midi](https://madderscientist.github.io/je_score_operator/midi.html)——利用特定文本生成midi文件的工具。<br>
所谓特定文本，即需要的json，需要给出音序号、时长、开始时间（可省略）。详见网站。若不写明开始时间，则默认在上一个音的后面追加。


### je谱确定节奏

[je谱确定节奏](https://madderscientist.github.io/je_score_operator/beat.html)——手动给没有时值的je谱加上时值的工具。<br>
基本操作：输入je谱，点击开始，两个手指交替按压键盘，按下表示音开始，抬起表示音结束，根据记录的毫秒数，进行近似处理，得到“midi制作”所需的“特定文本”。


## How I rescue je ?

je谱诞生以来一直诟病不断，就是针对其缺少时值信息的缺点。本项目的解决方法：
- ①利用[je谱确定节奏](https://madderscientist.github.io/je_score_operator/beat.html)确定je谱时值；
- ②利用[制作midi](https://madderscientist.github.io/je_score_operator/midi.html)把得到的结果转为midi；
- ③利用[midi转je/简谱](https://madderscientist.github.io/je_score_operator/miditostr)把mid文件转为图片简谱。
