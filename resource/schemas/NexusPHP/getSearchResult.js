if (!"".getQueryString) {
  String.prototype.getQueryString = function(name, split) {
    if (split == undefined) split = "&";
    var reg = new RegExp(
        "(^|" + split + "|\\?)" + name + "=([^" + split + "]*)(" + split + "|$)"
      ),
      r;
    if ((r = this.match(reg))) return decodeURI(r[2]);
    return null;
  };
}

(function(options, Searcher) {
  class Parser {
    constructor() {
      this.haveData = false;
      if (/takelogin\.php/.test(options.responseText)) {
        options.status = ESearchResultParseStatus.needLogin; //`[${options.site.name}]需要登录后再搜索`;
        return;
      }

      options.isLogged = true;

      if (
        /没有种子|No [Tt]orrents?|Your search did not match anything|用准确的关键字重试/.test(
          options.responseText
        )
      ) {
        options.status = ESearchResultParseStatus.noTorrents; // `[${options.site.name}]没有搜索到相关的种子`;
        return;
      }

      this.haveData = true;
    }

    /**
     * 获取搜索结果
     */
    getResult() {
      if (!this.haveData) {
        return [];
      }
      let site = options.site;
      let site_url_help = PTServiceFilters.parseURL(site.url);
      let selector = options.resultSelector || "table.torrents:last";
      selector = selector.replace("> tbody > tr", "");
      let table = options.page.find(selector);
      // 获取种子列表行
      let rows = table.find("> tbody > tr");
      if (rows.length == 0) {
        options.status = ESearchResultParseStatus.torrentTableIsEmpty; //`[${options.site.name}]没有定位到种子列表，或没有相关的种子`;
        return [];
      }
      let results = [];
      // 获取表头
      let header = table.find("> thead > tr > th");
      let beginRowIndex = 0;
      if (header.length == 0) {
        beginRowIndex = 1;
        header = rows.eq(0).find("th,td");
      }

      // 用于定位每个字段所列的位置
      let fieldIndex = {
        // 发布时间
        time: -1,
        // 大小
        size: -1,
        // 上传数量
        seeders: -1,
        // 下载数量
        leechers: -1,
        // 完成数量
        completed: -1,
        // 评论数量
        comments: -1,
        // 发布人
        author: header.length - 1,
        // 分类
        category: -1
      };

      if (site.url.lastIndexOf("/") != site.url.length - 1) {
        site.url += "/";
      }

      // 获取字段所在的列
      for (let index = 0; index < header.length; index++) {
        let cell = header.eq(index);
        let text = cell.text();

        // 评论数
        if (cell.find("img.comments").length) {
          fieldIndex.comments = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 发布时间
        if (cell.find("img.time").length) {
          fieldIndex.time = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 大小
        if (cell.find("img.size").length) {
          fieldIndex.size = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 种子数
        if (cell.find("img.seeders").length) {
          fieldIndex.seeders = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 下载数
        if (cell.find("img.leechers").length) {
          fieldIndex.leechers = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 完成数
        if (cell.find("img.snatched").length) {
          fieldIndex.completed = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }

        // 分类
        if (/(cat|类型|類型|分类|分類|Тип)/gi.test(text)) {
          fieldIndex.category = index;
          fieldIndex.author =
            index == fieldIndex.author ? -1 : fieldIndex.author;
          continue;
        }
      }

      try {
        // 遍历数据行
        for (let index = beginRowIndex; index < rows.length; index++) {
          const row = rows.eq(index);
          let cells = row.find(">td");

          let title = this.getTitle(row);

          // 没有获取标题时，继续下一个
          if (title.length == 0) {
            continue;
          }
          let link = title.attr("href");
          if (link && link.substr(0, 2) === "//") {
            // 适配HUDBT、WHU这样以相对链接开头
            link = `${site_url_help.protocol}://${link}`;
          } else if (link && link.substr(0, 4) !== "http") {
            link = `${site.url}${link}`;
          }

          // 获取下载链接
          let url = row.find("img.download").parent();

          if (url.length) {
            if (url.get(0).tagName !== "A") {
              let id = link.getQueryString("id");
              url = `download.php?id=${id}`;
            } else {
              url = url.attr("href");
            }
          } else {
            let id = link.getQueryString("id");
            url = `download.php?id=${id}`;
          }

          if (url && url.substr(0, 2) === "//") {
            // 适配HUDBT、WHU这样以相对链接开头
            url = `${site_url_help.protocol}://${url}`;
          } else if (url && url.substr(0, 4) !== "http") {
            url = `${site.url}${url}`;
          }

          if (!url) {
            continue;
          }

          url =
            url +
            (site && site.passkey ? "&passkey=" + site.passkey : "") +
            "&https=1";

          let data = {
            title: title.attr("title") || title.text(),
            subTitle: this.getSubTitle(title, row),
            link,
            url,
            size: cells.eq(fieldIndex.size).html() || 0,
            time:
              fieldIndex.time == -1
                ? ""
                : this.getTime(cells.eq(fieldIndex.time)),
            author:
              fieldIndex.author == -1
                ? ""
                : cells.eq(fieldIndex.author).text() || "",
            seeders:
              fieldIndex.seeders == -1
                ? ""
                : cells.eq(fieldIndex.seeders).text() || 0,
            leechers:
              fieldIndex.leechers == -1
                ? ""
                : cells.eq(fieldIndex.leechers).text() || 0,
            completed:
              fieldIndex.completed == -1
                ? ""
                : cells.eq(fieldIndex.completed).text() || 0,
            comments:
              fieldIndex.comments == -1
                ? ""
                : cells.eq(fieldIndex.comments).text() || 0,
            site: site,
            tags: this.getTags(row, options.torrentTagSelectors),
            entryName: options.entry.name,
            category:
              fieldIndex.category == -1
                ? null
                : this.getCategory(cells.eq(fieldIndex.category)),
            progress: Searcher.getFieldValue(site, row, "progress"),
            status: Searcher.getFieldValue(site, row, "status")
          };
          results.push(data);
        }
      } catch (error) {
        options.status = ESearchResultParseStatus.parseError;
        options.errorMsg = error.stack;
        //`[${options.site.name}]获取种子信息出错: ${error.stack}`;
      }

      return results;
    }

    /**
     * 获取时间
     * @param {*} cell
     */
    getTime(cell) {
      let time = cell.find("span[title],time[title]").attr("title");
      if (!time) {
        time = $("<span>")
          .html(cell.html().replace("<br>", " "))
          .text();
      }
      return time || "";
    }

    /**
     * 获取标签
     * @param {*} row
     * @param {*} selectors
     * @return array
     */
    getTags(row, selectors) {
      let tags = [];
      if (selectors && selectors.length > 0) {
        selectors.forEach(item => {
          if (item.selector) {
            let result = row.find(item.selector);
            if (result.length) {
              tags.push({
                name: item.name,
                color: item.color
              });
            }
          }
        });
      }
      return tags;
    }

    /**
     * 获取标题
     */
    getTitle(row) {
      let title = row.find("a[href*='hit'][title]").first();
      if (title.length == 0) {
        title = row.find("a[href*='hit']:has(b)").first();
      }

      if (title.length == 0) {
        // 特殊情况处理
        switch (options.site.host) {
          case "u2.dmhy.org":
            title = row.find("a.tooltip[href*='hit']").first();
            break;
        }
      }

      // 对title进行处理，防止出现cf的email protect
      let cfemail = title.find("span.__cf_email__");
      if (cfemail.length > 0) {
        cfemail.each((index, el) => {
          $(el).replaceWith(Searcher.cfDecodeEmail($(el).data("cfemail")));
        });
      }

      return title;
    }

    /**
     * 获取副标题
     * @param {*} title
     * @param {*} row
     */
    getSubTitle(title, row) {
      try {
        let subTitle = title
          .parent()
          .html()
          .split("<br>");
        if (subTitle && subTitle.length > 1) {
          subTitle = $("<span>")
            .html(subTitle[subTitle.length - 1])
            .text();
        } else {
          // 特殊情况处理
          switch (options.site.host) {
            case "hdchina.org":
              if (
                title
                  .parent()
                  .next()
                  .is("h4")
              ) {
                subTitle = title
                  .parent()
                  .next()
                  .text();
              }
              break;

            case "tp.m-team.cc":
            case "pt.m-team.cc":
              title = row.find("a[href*='hit'][title]").last();
              subTitle = title
                .parent()
                .html()
                .split("<br>");
              subTitle = $("<span>")
                .html(subTitle[subTitle.length - 1])
                .text();
              break;

            case "u2.dmhy.org":
              subTitle = $(".torrentname > tbody > tr:eq(1)", row)
                .find(".tooltip")
                .text();
              break;

            case "whu.pt":
            case "hudbt.hust.edu.cn":
              subTitle = $("h3", row).text();
              break;

            default:
              subTitle = "";
              break;
          }
        }

        return subTitle || "";
      } catch (error) {
        return "";
      }
    }

    /**
     * 获取分类
     * @param {*} cell 当前列
     */
    getCategory(cell) {
      let result = {
        name: "",
        link: ""
      };
      let link = cell.find("a:first");
      let img = link.find("img:first");

      if (link.length) {
        result.link = link.attr("href");
        if (result.link.substr(0, 4) !== "http") {
          result.link = options.site.url + result.link;
        }
      }

      if (img.length) {
        result.name = img.attr("title") || img.attr("alt");
      } else {
        result.name = link.text();
      }
      return result;
    }
  }

  let parser = new Parser(options);
  options.results = parser.getResult();
  console.log(options.results);
})(options, options.searcher);
