FROM etherpad/etherpad:2.5.3

# Set CI environment for pnpm
ENV CI=true

# Stay as etherpad user (default) and install plugins
RUN cd /opt/etherpad-lite && \
    pnpm add -w --save-dev --ignore-scripts \
    ep_headings2 \
    ep_markdown \
    ep_align \
    ep_font_color \
    ep_font_size \
    ep_comments_page \
    ep_table_of_contents \
    ep_adminpads2 \
    ep_author_hover \
    ep_cursortrace \
    ep_spellcheck \
    ep_set_title_on_pad \
    ep_webhooks \
    ep_hash_auth \
    ep_search \
    ep_copy_paste_select_all \
    ep_clear_formatting

# Set working directory
WORKDIR /opt/etherpad-lite

# Expose port
EXPOSE 9001

# Start Etherpad
CMD ["node", "--require", "tsx/cjs", "node/server.ts"]

