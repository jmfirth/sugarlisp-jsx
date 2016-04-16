/**
 * Javascript code generation for SugarLisp jsx
 */

var sl = require('sugarlisp-core/sl-types'),
  lex = require('sugarlisp-core/lexer'),
  reader = require('sugarlisp-core/reader'),
  utils = require('sugarlisp-core/utils'),
  debug = require('debug')('sugarlisp:jsx:keywords:debug'),
  trace = require('debug')('sugarlisp:jsx:keywords:trace');

// we generate plain jsx in "static" mode
// we generate javascript code that creates jsx strings in "dynamic" mode

// sugarlisp calls this function when a new jsx dialect is used
exports["__init"] = function (source, dialect) {
    // the default mode differs based on the file extension
    dialect.jsx_keyword_mode = getDefaultJsxKeywordMode(source);
  },

  // an xjsx tag
  exports["tag"] = function (forms) {

    // a tag must at the very least have a tag name:
    if (forms.length < 2) {
      forms.error("missing tag name");
    }

    var generated;

    // just popoff "tag" from the front of the expression
    var tagForm = forms.shift();

    // and see if that works as an expression
    // i.e. if the tag name is a function or macro we can call
    // (passthru false means *dont* pass things like e.g.
    //  e.g. "console.log" through to the output code)
    forms[0].value = sl.stripQuotes(sl.valueOf(forms[0]));
    var generated = this.transpileExpression(forms, {
      passthru: false
    });
    if (!generated) {
      trace((forms[0] && sl.valueOf(forms[0]) ? sl.valueOf(forms[0]) : "form") +
          " was not a macro or function")
        // add the quotes back
      forms[0].value = sl.valueOf(forms[0]); //sl.addQuotes(sl.valueOf(forms[0]));

      // put "tag" back on the front
      forms.unshift(tagForm);
      generated = renderTag.call(this, forms); // render it to static or dynamic jsx
    }
    return generated;
  }

function renderTag(forms) {
  var generated = sl.generated()

  this.indent += this.indentSize

  var tagName = sl.stripQuotes(sl.valueOf(forms[1]));
  var tagAttributes;
  var tagBody;
  if (forms.length > 2) {
    var formPos = 2;
    if (sl.isList(forms[formPos]) &&
      forms[formPos].length > 0 &&
      sl.valueOf(forms[formPos][0]) === 'attr') {
      tagAttributes = this.transpileExpression(forms[formPos]);
      formPos++;
    }
    if (formPos < forms.length) {
      if (Array.isArray(forms[formPos])) {
        tagBody = this.transpileExpression(forms[formPos]);
      } else {
        tagBody = forms[formPos].toString();
        if (tagBody.charAt(0) === '"') {
          tagBody = tagBody.substring(1, tagBody.length - 1);
        } else {
          tagBody = '{' + tagBody + '}'
        }
      }
    }
  }

  var startTag = '<' + tagName.trim() + '>'
  var endTag = '</' + tagName.trim() + '>'

  // var body = tagBody && tagBody.split ? tagBody.split('\n')
  //   .map((item) => {
  //     return ' '.repeat(this.indent + this.indentSize) + item;
  //   })
  //   .join('\n') : tagBody;
  // generated.push('\n' +
  //   ' '.repeat(this.indent) + startTag + '\n' +
  //   body + '\n' +
  //   ' '.repeat(this.indent) + endTag)

  generated.push('\n' +
    ' '.repeat(this.indent) + startTag + '\n' +
    ' '.repeat(this.indent + this.indentSize) + tagBody + '\n' +
    ' '.repeat(this.indent) + endTag)

  this.indent -= this.indentSize;

  return generated;
}

// the attributes of an xjsx tag
exports["attr"] = function (forms) {
  var generated = sl.generated();

  if (forms.length == 1) {
    // no attributes
    return generated;
  }

  this.transpileSubExpressions(forms)

  // if dynamic we have to escape the quotes around strings
  // since this winds up inside a quoted string of jsx
  var dyn = (getJsxKeywordMode(forms) === 'dynamic');
  var q = (dyn ? '\\"' : '"');

  for (var i = 1; i < forms.length; i = i + 2) {
    if (sl.typeOf(forms[i + 1]) === 'string') {
      generated.push([' ', sl.valueOf(forms[i]), '=' + q, sl.stripQuotes(sl.valueOf(forms[i + 1])), q]);
    } else {
      generated.push([' ', sl.valueOf(forms[i]), '=' + q + '\" + ', forms[i + 1].toString(), ' + \"' + q]);
    }
  }

  return generated;
}

// "tagjoiner" is smart about only emitting "+" in dynamic mode
// (originally we got by using simply "+" before there was static mode)
exports["tagjoiner"] = function (forms) {
  if (forms.length < 3) {
    forms.error("binary operator requires two or more arguments");
  }

  var generated;
  var dyn = (getJsxKeywordMode(forms) === 'dynamic');
  this.transpileSubExpressions(forms);

  // get rid of "tagjoiner" so it doesn't pass thru
  forms.shift();

  if (dyn) {
    // '+' joins the jsx strings in dynamic mode
    var op = sl.generated();
    // op.push([" ", "+", " "]);
    generated = sl.generatedFromArray(forms);
    generated.join(op); // inserts "+" between the forms
  } else {
    // in static mode we put out the text alone (no "+" and no quotes)
    generated = sl.generated();
    forms.forEach(function (form, i) {
      if (sl.typeOf(form) === 'string') {
        generated.push(sl.valueOf(form)
          .replace(/^\"|\"$/g, ''));
      } else {
        generated.push(form);
      }
      if (i < forms.length - 1) {
        generated.push(" ");
      }
    })
  }
  return generated;
}

function getJsxKeywordMode(forms) {
  var dialect = sl.lexerOf(forms)
    .dialects.find(function (dialect) {
      return dialect.name === "jsx";
    });
  if (!dialect || dialect.name !== "jsx") {
    console.log("warning: failed to find an jsx dialect used in this file");
    return getDefaultJsxKeywordMode(forms);
  }
  return dialect.jsx_keyword_mode;
}

function getDefaultJsxKeywordMode(formsOrLexer) {
  //return "dynamic"; // uncomment for testing
  var lexer;
  if (formsOrLexer instanceof lex.Lexer) {
    lexer = formsOrLexer;
  } else {
    lexer = sl.lexerOf(formsOrLexer);
    if (!lexer) {
      console.log("warning:  no lexer found on forms in jsx keyword handler.");
    }
  }
  return (lexer.filename.indexOf(".lsml") !== -1 ?
    "static" : "dynamic");
}
