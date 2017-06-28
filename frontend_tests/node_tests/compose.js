set_global('$', global.make_zjquery());
set_global('i18n', global.stub_i18n);

set_global('page_params', {
    use_websockets: false,
});

set_global('document', {
    location: {
    },
});
set_global('channel', {});
set_global('templates', {});

var noop = function () {};

add_dependencies({
    common: 'js/common',
    compose_state: 'js/compose_state',
    Handlebars: 'handlebars',
    people: 'js/people',
    stream_data: 'js/stream_data',
    util: 'js/util',
});

var compose = require('js/compose.js');

var me = {
    email: 'me@example.com',
    user_id: 30,
    full_name: 'Me Myself',
};

var alice = {
    email: 'alice@example.com',
    user_id: 31,
    full_name: 'Alice',
};

var bob = {
    email: 'bob@example.com',
    user_id: 32,
    full_name: 'Bob',
};

people.add(me);
people.initialize_current_user(me.user_id);

people.add(alice);
people.add(bob);

(function test_update_email() {
    compose_state.recipient('');
    assert.equal(compose.update_email(), undefined);

    compose_state.recipient('bob@example.com');
    compose.update_email(32, 'bob_alias@example.com');
    assert.equal(compose_state.recipient(), 'bob_alias@example.com');
}());

(function test_validate_stream_message_address_info() {
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);
    assert(compose.validate_stream_message_address_info('social'));

    $('#stream').select(noop);
    assert(!compose.validate_stream_message_address_info('foobar'));
    assert.equal($('#error-msg').html(), "<p>The stream <b>foobar</b> does not exist.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    sub.subscribed = false;
    stream_data.add_sub('social', sub);
    assert(!compose.validate_stream_message_address_info('social'));
    assert.equal($('#error-msg').html(), "<p>You're not subscribed to the stream <b>social</b>.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    global.page_params.narrow_stream = false;
    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'social');
        payload.data.subscribed = true;
        payload.success(payload.data);
    };
    assert(compose.validate_stream_message_address_info('social'));

    sub.name = 'Frontend';
    sub.stream_id = 102;
    stream_data.add_sub('Frontend', sub);
    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'Frontend');
        payload.data.subscribed = false;
        payload.success(payload.data);
    };
    assert(!compose.validate_stream_message_address_info('Frontend'));
    assert.equal($('#error-msg').html(), "<p>You're not subscribed to the stream <b>Frontend</b>.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'Frontend');
        payload.error({status: 404});
    };
    assert(!compose.validate_stream_message_address_info('Frontend'));
    assert.equal($('#error-msg').html(), "<p>The stream <b>Frontend</b> does not exist.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'social');
        payload.error({status: 500});
    };
    assert(!compose.validate_stream_message_address_info('social'));
    assert.equal($('#error-msg').html(), i18n.t("Error checking subscription"));
}());

(function test_validate() {
    $("#compose-send-button").removeAttr('disabled');
    $("#compose-send-button").focus();
    $("#sending-indicator").hide();
    $("#new_message_content").select(noop);
    assert(!compose.validate());
    assert(!$("#sending-indicator").visible());
    assert(!$("#compose-send-button").is_focused());
    assert.equal($("#compose-send-button").attr('disabled'), undefined);
    assert.equal($('#error-msg').html(), i18n.t('You have nothing to send!'));

    $("#new_message_content").val('foobarfoobar');
    var zephyr_checked = false;
    $("#zephyr-mirror-error").is = function () {
        if (!zephyr_checked) {
            zephyr_checked = true;
            return true;
        }
        return false;
    };
    assert(!compose.validate());
    assert(zephyr_checked);
    assert.equal($('#error-msg').html(), i18n.t('You need to be running Zephyr mirroring in order to send messages!'));

    compose_state.set_message_type('private');
    compose_state.recipient('');
    $("#private_message_recipient").select(noop);
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('Please specify at least one recipient'));

    compose_state.recipient('foo@zulip.com');
    global.page_params.realm_is_zephyr_mirror_realm = true;
    assert(compose.validate());

    global.page_params.realm_is_zephyr_mirror_realm = false;
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('The recipient foo@zulip.com is not valid', {}));

    compose_state.recipient('foo@zulip.com,alice@zulip.com');
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('The recipients foo@zulip.com,alice@zulip.com are not valid', {}));

    people.add_in_realm(bob);
    compose_state.recipient('bob@example.com');
    assert(compose.validate());

    compose_state.set_message_type('stream');
    compose_state.stream_name('');
    $("#stream").select(noop);
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('Please specify a stream'));

    compose_state.stream_name('Denmark');
    global.page_params.realm_mandatory_topics = true;
    compose_state.subject('');
    $("#subject").select(noop);
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('Please specify a topic'));
}());

(function test_get_invalid_recipient_emails() {
    var feedback_bot = {
        email: 'feedback@example.com',
        user_id: 124,
        full_name: 'Feedback Bot',
    };
    global.page_params.cross_realm_bots = [feedback_bot];
    global.page_params.user_id = 30;
    people.initialize();
    compose_state.recipient('feedback@example.com');
    assert.deepEqual(compose.get_invalid_recipient_emails(), []);
}());

(function test_validate_stream_message() {
    // This test is in kind of continuation to test_validate but since it is
    // primarly used to get coverage over functions called from validate()
    // we are seperating it up in different test. Though their relative position
    // of execution should not be changed.
    global.page_params.realm_mandatory_topics = false;
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);
    compose_state.stream_name('social');
    assert(compose.validate());
    assert(!$("#compose-all-everyone").visible());
    assert(!$("#send-status").visible());

    stream_data.get_subscriber_count = function (stream_name) {
        assert.equal(stream_name, 'social');
        return 16;
    };
    global.templates.render = function (template_name, data) {
        assert.equal(template_name, 'compose_all_everyone');
        assert.equal(data.count, 16);
        return 'compose_all_everyone_stub';
    };
    $('#compose-all-everyone').is = function (sel) {
        if (sel === ':visible') {
            return $('#compose-all-everyone').visible();
        }
    };
    var compose_content;
    $('#compose-all-everyone').append = function (data) {
        compose_content = data;
    };
    compose_state.message_content('Hey @all');
    assert(!compose.validate());
    assert.equal($("#compose-send-button").attr('disabled'), undefined);
    assert(!$("#send-status").visible());
    assert.equal(compose_content, 'compose_all_everyone_stub');
    assert($("#compose-all-everyone").visible());
}());

(function test_set_focused_recipient() {
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);

    var page = {
        '#stream': 'social',
        '#subject': 'lunch',
        '#new_message_content': 'burrito',
        '#private_message_recipient': 'alice@example.com,    bob@example.com',
    };

    global.$ = function (selector) {
        return {
            val: function () {
                return page[selector];
            },
        };
    };

    global.compose_state.get_message_type = function () {
        return 'stream';
    };

    global.$.trim = function (s) {
        return s;
    };


    var message = compose.create_message_object();
    assert.equal(message.to, 'social');
    assert.equal(message.subject, 'lunch');
    assert.equal(message.content, 'burrito');

    global.compose_state.get_message_type = function () {
        return 'private';
    };
    message = compose.create_message_object();
    assert.deepEqual(message.to, ['alice@example.com', 'bob@example.com']);
    assert.equal(message.to_user_ids, '31,32');
    assert.equal(message.content, 'burrito');

}());
